import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import * as faceapi from 'face-api.js';
import {
  CameraIcon, MapPinIcon, WifiIcon, CheckCircleIcon,
  ExclamationTriangleIcon, XCircleIcon, FaceSmileIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

const DEFAULT_MIN_ACCURACY = 45;
const SCAN_INTERVAL_MS = 700;
const MATCH_STREAK_REQUIRED = 2;
const BLINKS_REQUIRED = 2;
const BLINK_EAR_THRESHOLD = 0.22;
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

export default function StudentAttendance() {
  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [step, setStep] = useState(0);
  const [accessKey, setAccessKey] = useState('');
  const [accessKeyVerified, setAccessKeyVerified] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [gpsData, setGpsData] = useState({ latitude: null, longitude: null });
  const [gpsStatus, setGpsStatus] = useState('pending');
  const [gpsDetails, setGpsDetails] = useState('');
  const [networkStatus, setNetworkStatus] = useState('pending');
  const [networkDetails, setNetworkDetails] = useState('');
  const [publicIp, setPublicIp] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState(null);

  // Face scan state
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceScanning, setFaceScanning] = useState(false);
  const [accuracy, setAccuracy] = useState(0);
  const [faceRegistered, setFaceRegistered] = useState(true);
  const [faceMessage, setFaceMessage] = useState('');
  const [minAccuracy, setMinAccuracy] = useState(DEFAULT_MIN_ACCURACY);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const scanningRef = useRef(false);
  const matchStreakRef = useRef(0);
  const impostorWarnedRef = useRef(false);

  // Liveness detection state
  const [livenessVerified, setLivenessVerified] = useState(false);
  const [livenessChecking, setLivenessChecking] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [livenessMessage, setLivenessMessage] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const blinkStateRef = useRef('open'); // 'open' or 'closed'
  const livenessIntervalRef = useRef(null);

  useEffect(() => {
    api.get('/attendance/active-sessions').then(res => {
      setActiveSessions(res.data.sessions || []);
    }).catch(() => {});
  }, []);

  useEffect(() => () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (livenessIntervalRef.current) clearInterval(livenessIntervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    // Mirror to match teacher face registration captures
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const fetchPublicIp = useCallback(async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      if (data?.ip) { setPublicIp(data.ip); return data.ip; }
    } catch {
      try {
        const res = await fetch('https://api64.ipify.org?format=json');
        const data = await res.json();
        if (data?.ip) { setPublicIp(data.ip); return data.ip; }
      } catch { return null; }
    }
    return null;
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
        setStep(1);
      }
    } catch {
      toast.error('Camera access denied');
    }
  };

  const requestGPS = useCallback(() => {
    setGpsStatus('loading');
    if (!navigator.geolocation) {
      setGpsStatus('error');
      toast.error('GPS not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        setGpsData({ latitude, longitude });
        try {
          const res = await api.post('/attendance/validate', { latitude, longitude, public_ip: publicIp });
          const gps = res.data.gps;
          if (gps?.validated) {
            setGpsStatus('success');
            setGpsDetails(gps.reason || '');
            setStep(2);
          } else {
            setGpsStatus('error');
            setGpsDetails(gps?.reason || 'GPS validation failed');
            toast.error(gps?.reason || 'You are outside the approved campus area');
          }
        } catch (err) {
          setGpsStatus('error');
          const msg = err.response?.data?.gps?.reason || err.response?.data?.details || 'GPS check failed';
          setGpsDetails(msg);
          toast.error(msg);
        }
      },
      (err) => {
        setGpsStatus('error');
        toast.error('GPS access denied: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [publicIp]);

  const checkNetwork = useCallback(async () => {
    setNetworkStatus('loading');
    setNetworkDetails('');
    try {
      let ip = publicIp;
      if (!ip) ip = await fetchPublicIp();
      const res = await api.post('/attendance/validate', {
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        public_ip: ip,
      });
      const network = res.data.network;
      if (network?.validated) {
        setNetworkStatus('success');
        setNetworkDetails(network.reason || '');
        if (ip) setPublicIp(ip);
        setStep(3);
      } else {
        setNetworkStatus('error');
        const checked = network?.checked_ips?.join(', ') || res.data.client_ip || 'unknown';
        const msg = network?.reason || 'Network validation failed';
        setNetworkDetails(`${msg} (checked: ${checked})`);
        toast.error(msg);
      }
    } catch (err) {
      setNetworkStatus('error');
      const network = err.response?.data?.network;
      const msg = network?.reason || err.response?.data?.details || 'Network check failed';
      setNetworkDetails(msg);
      toast.error(msg);
    }
  }, [publicIp, gpsData.latitude, gpsData.longitude, fetchPublicIp]);

  const stopFaceScan = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setFaceScanning(false);
    matchStreakRef.current = 0;
  }, []);

  const submitAttendance = useCallback(async (frame) => {
    if (!selectedSession || marking) return;
    setMarking(true);
    stopFaceScan();

    const image = frame.includes(',') ? frame.split(',')[1] : frame;
    try {
      let ip = publicIp;
      if (!ip) ip = await fetchPublicIp();

      const res = await api.post('/attendance/mark', {
        session_id: selectedSession.id,
        image,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        public_ip: ip,
        access_key: accessKey,
      }, { timeout: 60000 });

      setResult(res.data);
      setStep(4);
      toast.success('Attendance marked!');
      streamRef.current?.getTracks().forEach(t => t.stop());
    } catch (err) {
      const data = err.response?.data || {};
      const errMsg = data.error || data.message || 'Failed to mark attendance';
      if (data.locked || errMsg.includes('Already Recorded')) {
        toast.error('Attendance Already Recorded');
        setResult({ error: 'Attendance Already Recorded', locked: true });
        return;
      }
      const details = data.details || (
        data.encoding_count !== undefined
          ? `Complete face enrollment on first login (${data.encoding_count}/${data.required || 20})`
          : data.accuracy_percent !== undefined
            ? `Match accuracy was ${data.accuracy_percent}%`
            : null
      );
      toast.error(errMsg);
      setResult({ error: errMsg, details, accuracy_percent: data.accuracy_percent });
      matchStreakRef.current = 0;
    } finally {
      setMarking(false);
    }
  }, [selectedSession, marking, stopFaceScan, publicIp, fetchPublicIp, gpsData]);

  const scanFace = useCallback(async () => {
    if (scanningRef.current || marking) return;
    const frame = captureFrame();
    if (!frame) return;

    scanningRef.current = true;
    try {
      const image = frame.split(',')[1];
      const res = await api.post('/attendance/verify-face', { image });
      const data = res.data;

      setFaceRegistered(data.registered !== false);
      setFaceDetected(!!data.face_detected);
      setAccuracy(data.accuracy_percent || 0);
      setFaceMessage(data.message || '');
      if (data.threshold_percent != null) {
        setMinAccuracy(data.threshold_percent);
      }

      if (!data.registered) {
        stopFaceScan();
        toast.error(data.message || 'Face not registered');
        return;
      }

      if (data.impostor_detected) {
        matchStreakRef.current = 0;
        const msg = 'This face does not match your registered account.';
        setFaceMessage(msg);
        if (!impostorWarnedRef.current) {
          toast.error(msg);
          impostorWarnedRef.current = true;
        }
      } else if (data.matched) {
        matchStreakRef.current += 1;
        if (matchStreakRef.current >= MATCH_STREAK_REQUIRED) {
          await submitAttendance(frame);
        }
      } else {
        matchStreakRef.current = 0;
      }
    } catch {
      setFaceDetected(false);
      setAccuracy(0);
    } finally {
      scanningRef.current = false;
    }
  }, [captureFrame, marking, stopFaceScan, submitAttendance]);

  const startFaceScan = useCallback(() => {
    if (scanIntervalRef.current) return;
    setFaceScanning(true);
    setAccuracy(0);
    setFaceDetected(false);
    matchStreakRef.current = 0;
    impostorWarnedRef.current = false;
    scanIntervalRef.current = setInterval(scanFace, SCAN_INTERVAL_MS);
    scanFace();
  }, [scanFace]);

  // --- Liveness detection (blink) ---
  const loadFaceModels = useCallback(async () => {
    if (modelsLoaded) return true;
    try {
      setLivenessMessage('Loading liveness models...');
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
      setModelsLoaded(true);
      return true;
    } catch (e) {
      console.error('Failed to load face-api models:', e);
      setLivenessMessage('Failed to load liveness models');
      return false;
    }
  }, [modelsLoaded]);

  const computeEAR = (eye) => {
    // Eye Aspect Ratio: (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    const v1 = dist(eye[1], eye[5]);
    const v2 = dist(eye[2], eye[4]);
    const h = dist(eye[0], eye[3]);
    return h > 0 ? (v1 + v2) / (2 * h) : 1;
  };

  const detectBlink = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
        .withFaceLandmarks(true);

      if (!detection) {
        setLivenessMessage('Position your face in the camera');
        return;
      }

      const landmarks = detection.landmarks;
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();
      const earLeft = computeEAR(leftEye);
      const earRight = computeEAR(rightEye);
      const ear = (earLeft + earRight) / 2;

      if (ear < BLINK_EAR_THRESHOLD) {
        if (blinkStateRef.current === 'open') {
          blinkStateRef.current = 'closed';
        }
      } else {
        if (blinkStateRef.current === 'closed') {
          blinkStateRef.current = 'open';
          // Blink completed!
          setBlinkCount(prev => {
            const newCount = prev + 1;
            if (newCount >= BLINKS_REQUIRED) {
              setLivenessVerified(true);
              setLivenessChecking(false);
              setLivenessMessage('Liveness verified! ✓');
              if (livenessIntervalRef.current) {
                clearInterval(livenessIntervalRef.current);
                livenessIntervalRef.current = null;
              }
              toast.success('Liveness verified! Proceeding to face scan...');
            }
            return newCount;
          });
        }
      }

      if (blinkStateRef.current === 'open') {
        setLivenessMessage(`Blink your eyes! (${Math.min(blinkCount, BLINKS_REQUIRED - 1)}/${BLINKS_REQUIRED})`);
      } else {
        setLivenessMessage('Blink detected...');
      }
    } catch {
      // Silently handle detection errors
    }
  }, [blinkCount]);

  const startLivenessCheck = useCallback(async () => {
    const loaded = await loadFaceModels();
    if (!loaded) {
      // If models fail to load, skip liveness
      setLivenessVerified(true);
      toast('Liveness detection unavailable, proceeding...', { icon: '⚠️' });
      return;
    }
    setLivenessChecking(true);
    setBlinkCount(0);
    blinkStateRef.current = 'open';
    setLivenessMessage(`Blink your eyes! (0/${BLINKS_REQUIRED})`);
    livenessIntervalRef.current = setInterval(detectBlink, 200);
  }, [loadFaceModels, detectBlink]);

  // Start liveness when reaching step 3
  useEffect(() => {
    if (step === 3 && cameraReady && !livenessVerified && !livenessChecking && !result) {
      const timer = setTimeout(startLivenessCheck, 500);
      return () => clearTimeout(timer);
    }
  }, [step, cameraReady, livenessVerified, livenessChecking, result, startLivenessCheck]);

  // Start face scan after liveness is verified
  useEffect(() => {
    if (step === 3 && cameraReady && livenessVerified && !faceScanning && !marking && !result) {
      const timer = setTimeout(startFaceScan, 500);
      return () => clearTimeout(timer);
    }
    if (step !== 3) stopFaceScan();
  }, [step, cameraReady, livenessVerified, faceScanning, marking, result, startFaceScan, stopFaceScan]);

  const stepIcons = [CameraIcon, MapPinIcon, WifiIcon, EyeIcon, FaceSmileIcon, CheckCircleIcon];
  const stepLabels = ['Camera', 'GPS', 'Network', 'Liveness', 'Face Scan', 'Done'];
  const displayStep = !livenessVerified && step === 3 ? 3 : livenessVerified && step === 3 ? 4 : step > 3 ? 5 : step;

  const faceStatusLabel = !faceRegistered
    ? 'Not registered'
    : marking
      ? 'Marking...'
      : faceScanning
        ? faceDetected
          ? accuracy >= minAccuracy ? `Matched ${accuracy}%` : `Scanning ${accuracy}%`
          : 'Position face in oval'
        : 'Ready';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">📸 Mark Attendance</h1>

      {!selectedSession && (
        <div className="space-y-4">
          {activeSessions.length > 0 ? (
            <>
              <p className="text-sm text-surface-500">Select an active session to mark your attendance:</p>
              {activeSessions.map(s => {
                const locked = s.student_status?.locked;
                const phase = s.phase === 'end_window' ? 'End Verify' : 'Mark Start';
                const startTime = s.attendance_window_start?.slice(11, 16);
                const endTime = s.end_time?.slice(11, 16) || s.end_verification_end?.slice(11, 16);
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`glass-card p-5 transition-all ${locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5'}`}
                    onClick={() => {
                      if (locked) {
                        toast.error('Attendance Already Recorded');
                        return;
                      }
                      if (s.phase === 'end_window' && !s.student_status?.eligible_for_end) {
                        toast.error('Not eligible — you did not mark attendance at class start');
                        return;
                      }
                      setSelectedSession(s);
                      setAccessKey('');
                      setAccessKeyVerified(!s.access_key_required);
                      if (!s.access_key_required) {
                        setTimeout(startCamera, 200);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-surface-900 dark:text-surface-100">{s.subject}</h3>
                        <p className="text-sm text-surface-500">
                          Section {s.section} · {s.teacher_name && `Prof. ${s.teacher_name} · `}{s.campus || s.college}
                        </p>
                        {startTime && (
                          <p className="text-xs text-surface-400 mt-1">
                            🕐 {startTime}{endTime ? ` – ${endTime}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {locked ? (
                          <span className="badge badge-full">Already Recorded</span>
                        ) : (
                          <span className={`badge ${s.phase === 'end_window' ? 'badge-partial' : 'badge-active'}`}>
                            {phase}
                          </span>
                        )}
                        {s.access_key_required && !locked && (
                          <span className="text-xs text-amber-400">🔑 Key Required</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </>
          ) : (
            <div className="glass-card p-12 text-center">
              <XCircleIcon className="w-16 h-16 mx-auto text-surface-300 dark:text-surface-400 mb-4" />
              <h3 className="text-lg font-bold text-surface-700 dark:text-surface-300  mb-2">No Active Sessions</h3>
              <p className="text-sm text-surface-500">There are no attendance sessions available right now.</p>
            </div>
          )}
        </div>
      )}

      {/* Access Key Prompt */}
      {selectedSession && !accessKeyVerified && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-8 max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🔑</span>
            </div>
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">Enter Session Access Key</h2>
            <p className="text-sm text-surface-500 mt-1">
              Your teacher has set an access key for <strong>{selectedSession.subject}</strong>
            </p>
          </div>
          <input
            type="text"
            value={accessKey}
            onChange={e => setAccessKey(e.target.value)}
            placeholder="Enter access key..."
            className="input-field text-center text-lg tracking-widest font-bold uppercase mb-4"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('verify-key-btn')?.click();
              }
            }}
          />
          <div className="flex gap-3">
            <button
              onClick={() => {
                setSelectedSession(null);
                setAccessKey('');
              }}
              className="btn-secondary flex-1"
            >
              Back
            </button>
            <button
              id="verify-key-btn"
              onClick={async () => {
                if (!accessKey.trim()) {
                  toast.error('Please enter the access key');
                  return;
                }
                setVerifyingKey(true);
                try {
                  const res = await api.post('/attendance/verify-access-key', {
                    session_id: selectedSession.id,
                    access_key: accessKey.trim(),
                  });
                  if (res.data.valid) {
                    setAccessKeyVerified(true);
                    toast.success('Access key verified!');
                    setTimeout(startCamera, 200);
                  }
                } catch (err) {
                  toast.error(err.response?.data?.error || 'Invalid access key');
                } finally {
                  setVerifyingKey(false);
                }
              }}
              disabled={verifyingKey || !accessKey.trim()}
              className="btn-primary flex-1"
            >
              {verifyingKey ? <><span className="spinner" /> Verifying...</> : 'Verify Key'}
            </button>
          </div>
        </motion.div>
      )}

      {selectedSession && accessKeyVerified && !result && (
        <div className="space-y-6">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              {stepLabels.map((label, i) => {
                const Icon = stepIcons[i];
                const active = displayStep === i;
                const done = displayStep > i;
                return (
                  <div key={label} className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all ${
                      done ? 'bg-emerald-500 text-white' : active ? 'bg-surface-600 text-white animate-pulse' : 'bg-surface-200  text-surface-500'
                    }`}>
                      {done ? <CheckCircleIcon className="w-4 h-4 md:w-5 md:h-5" /> : <Icon className="w-4 h-4 md:w-5 md:h-5" />}
                    </div>
                    <span className={`text-[10px] md:text-xs font-medium ${active ? 'text-surface-400' : 'text-surface-500'}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-surface-600 to-surface-600 flex items-center justify-center text-white text-xl">📋</div>
            <div>
              <h3 className="font-bold text-surface-900 dark:text-surface-100">{selectedSession.subject}</h3>
              <p className="text-sm text-surface-500">Section {selectedSession.section}</p>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-900">
                <button onClick={startCamera} className="btn-primary py-3 px-8">
                  <CameraIcon className="w-5 h-5" /> Enable Camera
                </button>
              </div>
            )}

            {/* Liveness check overlay */}
            {step === 3 && cameraReady && !livenessVerified && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="bg-black/70 backdrop-blur-sm rounded-2xl p-6 text-center max-w-xs">
                  <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-3">
                    <EyeIcon className={`w-8 h-8 text-primary-400 ${livenessChecking ? 'animate-pulse' : ''}`} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">Liveness Check</h3>
                  <p className="text-sm text-surface-300 mb-3">{livenessMessage || 'Preparing...'}</p>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    {Array.from({ length: BLINKS_REQUIRED }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-4 h-4 rounded-full transition-all duration-300 ${
                          i < blinkCount
                            ? 'bg-emerald-400 scale-110 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                            : 'bg-surface-600 border border-surface-500'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-surface-500">Anti-spoofing verification</p>
                </div>
              </div>
            )}

            {step === 3 && cameraReady && livenessVerified && (
              <>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-48 h-60 rounded-[50%] border-4 transition-colors duration-300 ${
                    accuracy >= minAccuracy
                      ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.6)]'
                      : faceDetected
                        ? 'border-amber-400'
                        : 'border-white/40'
                  }`} />
                </div>

                <div className={`absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  accuracy >= minAccuracy
                    ? 'bg-emerald-500/90 text-white'
                    : faceDetected
                      ? 'bg-amber-500/90 text-white'
                      : 'bg-black/60 text-white'
                }`}>
                  {accuracy >= minAccuracy ? (
                    <><CheckCircleIcon className="w-4 h-4" /> Match {accuracy}%</>
                  ) : faceDetected ? (
                    <><FaceSmileIcon className="w-4 h-4" /> Reading face… {accuracy}%</>
                  ) : (
                    <><ExclamationTriangleIcon className="w-4 h-4" /> Position face in oval</>
                  )}
                </div>

                {/* Liveness verified badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/90 text-white text-xs font-bold">
                  <EyeIcon className="w-3.5 h-3.5" /> Live ✓
                </div>

                {faceScanning && (
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="bg-black/70 rounded-lg p-2">
                      <div className="flex justify-between text-xs text-white mb-1">
                        <span>Face match accuracy</span>
                        <span className="font-bold">{accuracy}% / {minAccuracy}% required</span>
                      </div>
                      <div className="w-full bg-white/20 rounded-full h-2">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            accuracy >= minAccuracy ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${Math.min(accuracy, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-3">
            {step === 1 && (
              <button onClick={requestGPS} className="btn-primary flex-1 py-3">
                {gpsStatus === 'loading' ? <><span className="spinner" /> Getting GPS...</> : '📍 Verify GPS Location'}
              </button>
            )}
            {step === 2 && (
              <button onClick={checkNetwork} className="btn-primary flex-1 py-3">
                {networkStatus === 'loading' ? <><span className="spinner" /> Checking...</> : '📡 Verify Network'}
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => { const f = captureFrame(); if (f) submitAttendance(f); }}
                disabled={marking || !faceRegistered}
                className="btn-success flex-1 py-3"
              >
                {marking ? <><span className="spinner" /> Marking attendance...</> : '📸 Capture & Mark Manually'}
              </button>
            )}
          </div>

          {step === 3 && faceMessage && !faceRegistered && (
            <p className="text-sm text-red-500 text-center">{faceMessage}</p>
          )}

          {step === 3 && faceScanning && faceRegistered && (
            <p className="text-xs text-surface-500 text-center">
              Hold still — attendance marks automatically when accuracy reaches {minAccuracy}%+
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`glass-card p-3 text-center ${gpsStatus === 'success' ? 'border-emerald-500/50' : gpsStatus === 'error' ? 'border-red-500/50' : ''}`}>
              <MapPinIcon className={`w-6 h-6 mx-auto mb-1 ${gpsStatus === 'success' ? 'text-emerald-500' : gpsStatus === 'error' ? 'text-red-500' : 'text-surface-400'}`} />
              <p className="text-xs font-medium">{gpsStatus === 'success' ? 'GPS OK' : gpsStatus === 'error' ? 'GPS Failed' : 'GPS'}</p>
            </div>
            <div className={`glass-card p-3 text-center ${networkStatus === 'success' ? 'border-emerald-500/50' : networkStatus === 'error' ? 'border-red-500/50' : ''}`}>
              <WifiIcon className={`w-6 h-6 mx-auto mb-1 ${networkStatus === 'success' ? 'text-emerald-500' : networkStatus === 'error' ? 'text-red-500' : 'text-surface-400'}`} />
              <p className="text-xs font-medium">{networkStatus === 'success' ? 'Network OK' : networkStatus === 'error' ? 'Network Failed' : 'Network'}</p>
            </div>
            <div className={`glass-card p-3 text-center ${cameraReady ? 'border-emerald-500/50' : ''}`}>
              <CameraIcon className={`w-6 h-6 mx-auto mb-1 ${cameraReady ? 'text-emerald-500' : 'text-surface-400'}`} />
              <p className="text-xs font-medium">{cameraReady ? 'Camera OK' : 'Camera'}</p>
            </div>
            <div className={`glass-card p-3 text-center ${
              accuracy >= minAccuracy ? 'border-emerald-500/50' : step === 3 && faceDetected ? 'border-amber-500/50' : ''
            }`}>
              <FaceSmileIcon className={`w-6 h-6 mx-auto mb-1 ${
                accuracy >= minAccuracy ? 'text-emerald-500' : faceDetected ? 'text-amber-500' : 'text-surface-400'
              }`} />
              <p className="text-xs font-medium">{faceStatusLabel}</p>
            </div>
          </div>

          {(gpsDetails || networkDetails) && (
            <div className="text-xs text-surface-500 space-y-1">
              {gpsDetails && <p>📍 {gpsDetails}</p>}
              {networkDetails && <p>📡 {networkDetails}</p>}
            </div>
          )}
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-8 text-center">
          {result.error ? (
            <>
              <ExclamationTriangleIcon className="w-16 h-16 mx-auto text-red-500 mb-4" />
              <h2 className="text-xl font-bold text-red-600 mb-2">
                {result.error?.toLowerCase().includes('window closed') ? 'Session Window Closed' : 'Verification Failed'}
              </h2>
              <p className="text-surface-400 ">{result.error}</p>
              {result.details && <p className="text-sm text-surface-500 mt-2">{result.details}</p>}
              {result.error?.toLowerCase().includes('window closed') && (
                <p className="text-sm text-amber-600 mt-2">Your face was recognized — the attendance time window had already ended.</p>
              )}
              {result.accuracy_percent !== undefined && (
                <p className="text-sm font-semibold text-amber-600 mt-2">Face match: {result.accuracy_percent}%</p>
              )}
              <button onClick={() => {
                setResult(null); setStep(3); setAccuracy(0); setFaceDetected(false);
                matchStreakRef.current = 0; startFaceScan();
              }} className="btn-secondary mt-6 mr-2">Retry Face Scan</button>
              <button onClick={() => {
                setResult(null); setStep(0); setCameraReady(false); setSelectedSession(null);
                stopFaceScan();
              }} className="btn-secondary mt-6">Start Over</button>
            </>
          ) : (
            <>
              <CheckCircleIcon className="w-20 h-20 mx-auto text-emerald-500 mb-4" />
              <h2 className="text-2xl font-extrabold text-emerald-600 mb-2">Attendance Marked! ✨</h2>
              <p className="text-surface-400  mb-4">
                {result.phase === 'start' ? 'Start verification completed' : 'End verification completed'}
              </p>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
                <div className="text-center">
                  <p className="text-2xl font-bold text-surface-400">
                    {result.accuracy_percent ?? Math.round((result.confidence || 0) * 100)}%
                  </p>
                  <p className="text-xs text-surface-500">Face Accuracy</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-500">{result.gps_validated ? '✅' : '❌'}</p>
                  <p className="text-xs text-surface-500">GPS</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-500">{result.network_validated ? '✅' : '❌'}</p>
                  <p className="text-xs text-surface-500">Network</p>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
