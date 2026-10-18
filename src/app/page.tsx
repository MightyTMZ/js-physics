"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import metadata from "../tfjs_model/metadata.json";

// ---- types ----------------------------------------------------------------

interface SensorData {
  attitude: { roll: number; pitch: number; yaw: number };
  gravity: { x: number; y: number; z: number };
  rotationRate: { x: number; y: number; z: number };
  userAcceleration: { x: number; y: number; z: number };
}

interface Prediction {
  label: string;
  probabilities: Record<string, number>;
}

const INITIAL: SensorData = {
  attitude: { roll: 0, pitch: 0, yaw: 0 },
  gravity: { x: 0, y: 0, z: 0 },
  rotationRate: { x: 0, y: 0, z: 0 },
  userAcceleration: { x: 0, y: 0, z: 0 },
};

const LABELS = metadata.activities;
const NORM_MEANS = metadata.normalization.means;
const NORM_STDS = metadata.normalization.stds;
const FEATURES_PER_TIMESTEP = metadata.sensorCols.length; // 12
const TOTAL_FEATURES = NORM_MEANS.length; // 120
const WINDOW_SIZE = TOTAL_FEATURES / FEATURES_PER_TIMESTEP; // 10 timesteps
const INFERENCE_INTERVAL = 5000;

// ---- helpers ---------------------------------------------------------------

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function sensorToRow(d: SensorData): number[] {
  return [
    d.attitude.roll,
    d.attitude.pitch,
    d.attitude.yaw,
    d.gravity.x,
    d.gravity.y,
    d.gravity.z,
    d.rotationRate.x,
    d.rotationRate.y,
    d.rotationRate.z,
    d.userAcceleration.x,
    d.userAcceleration.y,
    d.userAcceleration.z,
  ];
}

/** Z-score normalization using training-set statistics */
function normalize(flat: number[]): Float32Array {
  const out = new Float32Array(flat.length);
  for (let i = 0; i < flat.length; i++) {
    out[i] = (flat[i] - NORM_MEANS[i]) / (NORM_STDS[i] || 1);
  }
  return out;
}

// ---- component -------------------------------------------------------------

export default function Home() {
  const [data, setData] = useState<SensorData>(INITIAL);
  const [permissionState, setPermissionState] = useState<
    "prompt" | "granted" | "unsupported"
  >("prompt");
  const [geoCoords, setGeoCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  const latestRef = useRef<SensorData>({ ...INITIAL });
  const bufferRef = useRef<number[][]>([]);
  const modelRef = useRef<tf.LayersModel | null>(null);

  // ---- load TFJS model once ------------------------------------------------

  useEffect(() => {
    tf.ready().then(async () => {
      const model = await tf.loadLayersModel("/tfjs_model/model.json");
      modelRef.current = model;
      console.log("TFJS model loaded, backend:", tf.getBackend());
    });
  }, []);

  // ---- inference ------------------------------------------------------------

  const runInference = useCallback(async () => {
    const model = modelRef.current;
    const buf = bufferRef.current;
    if (!model || buf.length < WINDOW_SIZE) return;

    const win = buf.slice(-WINDOW_SIZE);
    const flat = win.flat();
    const normalized = normalize(flat);

    const input = tf.tensor2d(normalized, [1, TOTAL_FEATURES]);
    const output = model.predict(input) as tf.Tensor;
    const probs = await output.data();

    const probabilities: Record<string, number> = {};
    let maxIdx = 0;
    for (let i = 0; i < LABELS.length; i++) {
      probabilities[LABELS[i]] = Math.round(probs[i] * 10000) / 10000;
      if (probs[i] > probs[maxIdx]) maxIdx = i;
    }

    setPrediction({ label: LABELS[maxIdx], probabilities });

    input.dispose();
    output.dispose();
  }, []);

  // ---- sensor listeners -----------------------------------------------------

  const startListening = useCallback(() => {
    const motionHandler = (event: DeviceMotionEvent) => {
      const accel = event.acceleration;
      const accelG = event.accelerationIncludingGravity;
      const rot = event.rotationRate;

      if (accel) {
        latestRef.current.userAcceleration = {
          x: accel.x ?? 0,
          y: accel.y ?? 0,
          z: accel.z ?? 0,
        };
      }
      if (accelG && accel) {
        latestRef.current.gravity = {
          x: (accelG.x ?? 0) - (accel.x ?? 0),
          y: (accelG.y ?? 0) - (accel.y ?? 0),
          z: (accelG.z ?? 0) - (accel.z ?? 0),
        };
      }
      if (rot) {
        latestRef.current.rotationRate = {
          x: rot.alpha ?? 0,
          y: rot.beta ?? 0,
          z: rot.gamma ?? 0,
        };
      }
    };

    const orientationHandler = (event: DeviceOrientationEvent) => {
      latestRef.current.attitude = {
        pitch: degToRad(event.beta ?? 0),
        roll: degToRad(event.gamma ?? 0),
        yaw: degToRad(event.alpha ?? 0),
      };
    };

    window.addEventListener("devicemotion", motionHandler);
    window.addEventListener("deviceorientation", orientationHandler);

    // Every 1 s: snapshot sensor data & push into sliding-window buffer
    const sampleId = setInterval(() => {
      const snapshot = { ...latestRef.current };
      setData(snapshot);
      bufferRef.current.push(sensorToRow(snapshot));
      if (bufferRef.current.length > WINDOW_SIZE) {
        bufferRef.current = bufferRef.current.slice(-WINDOW_SIZE);
      }
    }, 1000);

    // Every 5 s: run inference
    const inferenceId = setInterval(() => {
      runInference();
    }, INFERENCE_INTERVAL);

    setPermissionState("granted");

    return () => {
      window.removeEventListener("devicemotion", motionHandler);
      window.removeEventListener("deviceorientation", orientationHandler);
      clearInterval(sampleId);
      clearInterval(inferenceId);
    };
  }, [runInference]);

  // ---- geolocation ----------------------------------------------------------

  const startGeolocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not supported by this browser.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGeoCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGeoError(null);
      },
      (error) => setGeoError(error.message),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  };

  // ---- permissions / init ---------------------------------------------------

  useEffect(() => {
    if (!("DeviceMotionEvent" in window)) {
      setPermissionState("unsupported");
      return;
    }
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") return;

    const cleanupMotion = startListening();
    const cleanupGeo = startGeolocation();
    return () => {
      cleanupMotion?.();
      cleanupGeo?.();
    };
  }, [startListening]);

  const requestPermission = async () => {
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (typeof DME.requestPermission === "function") {
        const r = await DME.requestPermission();
        if (r !== "granted") {
          setPermissionState("unsupported");
          return;
        }
      }
      if (typeof DOE.requestPermission === "function") {
        const r = await DOE.requestPermission();
        if (r !== "granted") {
          setPermissionState("unsupported");
          return;
        }
      }
      startListening();
      startGeolocation();
    } catch {
      setPermissionState("unsupported");
    }
  };

  // ---- UI data --------------------------------------------------------------

  const sections: {
    title: string;
    unit: string;
    keys: { label: string; value: number }[];
  }[] = [
    {
      title: "Attitude",
      unit: "rad",
      keys: [
        { label: "Roll", value: data.attitude.roll },
        { label: "Pitch", value: data.attitude.pitch },
        { label: "Yaw", value: data.attitude.yaw },
      ],
    },
    {
      title: "Gravity",
      unit: "m/s²",
      keys: [
        { label: "X", value: data.gravity.x },
        { label: "Y", value: data.gravity.y },
        { label: "Z", value: data.gravity.z },
      ],
    },
    {
      title: "Rotation Rate",
      unit: "°/s",
      keys: [
        { label: "X", value: data.rotationRate.x },
        { label: "Y", value: data.rotationRate.y },
        { label: "Z", value: data.rotationRate.z },
      ],
    },
    {
      title: "User Acceleration",
      unit: "m/s²",
      keys: [
        { label: "X", value: data.userAcceleration.x },
        { label: "Y", value: data.userAcceleration.y },
        { label: "Z", value: data.userAcceleration.z },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 py-10 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-4">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Device Sensors
        </h1>

        {permissionState === "unsupported" && (
          <p className="text-red-500">
            Motion/Orientation API is not supported on this device/browser.
          </p>
        )}

        {permissionState === "prompt" && (
          <button
            onClick={requestPermission}
            className="rounded-full bg-black px-6 py-3 text-white dark:bg-white dark:text-black"
          >
            Enable Motion Sensors
          </button>
        )}

        {/* Activity Prediction */}
        <div className="w-full rounded-2xl border-2 border-indigo-500 bg-indigo-50 p-5 dark:bg-indigo-950">
          <h2 className="mb-2 text-lg font-semibold text-indigo-900 dark:text-indigo-100">
            Activity Prediction
          </h2>
          {prediction ? (
            <>
              <p className="text-3xl font-bold capitalize text-indigo-700 dark:text-indigo-300">
                {prediction.label}
              </p>
              <div className="mt-3 space-y-1">
                {LABELS.map((l) => (
                  <div key={l} className="flex items-center gap-2 text-sm">
                    <span className="w-24 capitalize text-indigo-800 dark:text-indigo-200">
                      {l}
                    </span>
                    <div className="h-2 flex-1 rounded-full bg-indigo-200 dark:bg-indigo-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{
                          width: `${(prediction.probabilities[l] ?? 0) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-indigo-600 dark:text-indigo-400">
                      {((prediction.probabilities[l] ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-indigo-400">
              Collecting data… (need {WINDOW_SIZE} s of readings)
            </p>
          )}
        </div>

        {/* Sensor sections */}
        {sections.map((section) => (
          <div key={section.title} className="w-full">
            <h2 className="mb-3 text-lg font-semibold text-black dark:text-zinc-50">
              {section.title}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {section.keys.map((k) => (
                <div
                  key={k.label}
                  className="flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <span className="text-xs uppercase tracking-wider text-zinc-500">
                    {k.label}
                  </span>
                  <span className="mt-1 text-2xl font-mono font-bold text-black dark:text-white">
                    {k.value.toFixed(4)}
                  </span>
                  <span className="text-xs text-zinc-400">{section.unit}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Geolocation */}
        <div className="w-full">
          <h2 className="mb-3 text-lg font-semibold text-black dark:text-zinc-50">
            Geolocation
          </h2>
          {geoError && (
            <p className="text-red-500 text-sm mb-2">{geoError}</p>
          )}
          {geoCoords ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  Latitude
                </span>
                <span className="mt-1 text-xl font-mono font-bold text-black dark:text-white">
                  {geoCoords.latitude.toFixed(6)}
                </span>
                <span className="text-xs text-zinc-400">°</span>
              </div>
              <div className="flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  Longitude
                </span>
                <span className="mt-1 text-xl font-mono font-bold text-black dark:text-white">
                  {geoCoords.longitude.toFixed(6)}
                </span>
                <span className="text-xs text-zinc-400">°</span>
              </div>
              <div className="col-span-2 flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  Accuracy
                </span>
                <span className="mt-1 text-xl font-mono font-bold text-black dark:text-white">
                  ±{geoCoords.accuracy.toFixed(1)}
                </span>
                <span className="text-xs text-zinc-400">meters</span>
              </div>
            </div>
          ) : (
            !geoError && (
              <p className="text-sm text-zinc-400">
                Waiting for location data…
              </p>
            )
          )}
        </div>
      </main>
    </div>
  );
}
