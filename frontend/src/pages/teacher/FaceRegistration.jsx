import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { CameraIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const MIN_CAPTURES = 5;
const TARGET_CAPTURES = 15;
const CAPTURE_INTERVAL_MS = 500;
const MAX_ATTEMPTS = 50;
const CAMERA_WARMUP_MS = 1500;

export default function FaceRegistration() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showWebcam, setShowWebcam] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [captures, setCaptures] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [registrationErrors, setRegistrationErrors] = useState([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const previewIntervalRef = useRef(null);
  const capturesRef = useRef([]);
  const selectedStudentRef = useRef(null);
  const detectingRef = useRef(false);

  const fetchStudents = () => {
    api.get(`/teacher/students?search=${search}&per_page=100`).then(res => setStudents(res.data.students || []))
      .catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchStudents(); }, [search]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const detectFaceInFrame = useCallback(async (frame) => {
    const image = frame.includes(',') ? frame.split(',')[1] : frame;
    const res = await api.post('/teacher/detect-face', { image });
    return res.data.face_detected;
  }, []);

  const stopPreview = useCallback(() => {
    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
      previewIntervalRef.current = null;
    }
  }, []);

  const stopAutoCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    stopPreview();
    setIsCapturing(false);
  }, [stopPreview]);

  const registerFaces = useCallback(async (imageList, student) => {
    if (!student || imageList.length < MIN_CAPTURES) {
      toast.error(`Need at least ${MIN_CAPTURES} images with a detectable face`);
      return;
    }

    setRegistering(true);
    setRegistrationErrors([]);
    try {
      const images = imageList.map(c => (c.includes(',') ? c.split(',')[1] : c));
      const res = await api.post(`/teacher/students/${student.id}/register-face`, { images, mode: 'webcam' });
      toast.success(`Registered ${res.data.stored_count} face encodings!`);
      stopAutoCapture();
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setShowWebcam(false);
      setCaptures([]);
      capturesRef.current = [];
      setSelectedStudent(null);
      selectedStudentRef.current = null;
      setFaceDetected(false);
      setCameraReady(false);
      fetchStudents();
    } catch (err) {
      const data = err.response?.data || {};
      const errors = data.errors || [];
      setRegistrationErrors(errors.slice(0, 8));
      toast.error(data.error || 'Registration failed — ensure your face is clearly visible');
    } finally {
      setRegistering(false);
    }
  }, [stopAutoCapture]);

  const startFacePreview = useCallback(() => {
    if (previewIntervalRef.current) return;

    previewIntervalRef.current = setInterval(async () => {
      if (detectingRef.current || isCapturing) return;
      const frame = captureFrame();
      if (!frame) return;

      detectingRef.current = true;
      try {
        const detected = await detectFaceInFrame(frame);
        setFaceDetected(detected);
      } catch {
        setFaceDetected(false);
      } finally {
        detectingRef.current = false;
      }
    }, 700);
  }, [captureFrame, detectFaceInFrame, isCapturing]);

  const startAutoCapture = useCallback(() => {
    if (intervalRef.current) return;

    setIsCapturing(true);
    setCaptures([]);
    capturesRef.current = [];
    setRegistrationErrors([]);
    let validCount = 0;
    let attempts = 0;

    intervalRef.current = setInterval(async () => {
      if (registering) return;

      const frame = captureFrame();
      if (!frame) return;

      attempts++;
      try {
        const detected = await detectFaceInFrame(frame);
        setFaceDetected(detected);

        if (detected) {
          capturesRef.current = [...capturesRef.current, frame];
          validCount = capturesRef.current.length;
          setCaptures([...capturesRef.current]);
        }
      } catch {
        setFaceDetected(false);
      }

      if (validCount >= TARGET_CAPTURES || attempts >= MAX_ATTEMPTS) {
        stopAutoCapture();
        if (validCount >= MIN_CAPTURES) {
          await registerFaces(capturesRef.current, selectedStudentRef.current);
        } else {
          toast.error(
            `Only detected a face in ${validCount} frames. ` +
            `Position your face in the oval with good lighting and try again.`
          );
        }
      }
    }, CAPTURE_INTERVAL_MS);
  }, [captureFrame, detectFaceInFrame, registerFaces, registering, stopAutoCapture]);

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().then(() => {
            setTimeout(() => {
              setCameraReady(true);
              startFacePreview();
              startAutoCapture();
            }, CAMERA_WARMUP_MS);
          }).catch(() => toast.error('Could not start camera preview'));
        };
      }
    } catch {
      toast.error('Camera access denied');
      setShowWebcam(false);
    }
  }, [startAutoCapture, startFacePreview]);

  const stopWebcam = () => {
    stopAutoCapture();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setFaceDetected(false);
  };

  const openWebcam = (student) => {
    setSelectedStudent(student);
    selectedStudentRef.current = student;
    setCaptures([]);
    capturesRef.current = [];
    setRegistrationErrors([]);
    setShowWebcam(true);
    setTimeout(startWebcam, 100);
  };

  const closeWebcam = () => {
    if (isCapturing || registering) return;
    stopWebcam();
    setShowWebcam(false);
    setCaptures([]);
    capturesRef.current = [];
    setSelectedStudent(null);
    selectedStudentRef.current = null;
  };

  const retryCapture = () => {
    setCaptures([]);
    capturesRef.current = [];
    setRegistrationErrors([]);
    if (cameraReady) startAutoCapture();
  };

  const statusColor = { pending: 'badge-pending', registered: 'badge-registered', failed: 'badge-failed' };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-2">📸 Face Registration</h1>
      <p className="text-sm text-surface-500 mb-6">
        Register each student&apos;s face here first. Students can only mark attendance after a successful registration.
      </p>

      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..." className="input-field mb-4 max-w-md" />

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Roll No</th><th>Dept</th><th>Section</th><th>Status</th><th>Encodings</th><th>Action</th></tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}</td>
                <td>{s.roll_number}</td>
                <td>{s.department}</td>
                <td>{s.section}</td>
                <td><span className={`badge ${statusColor[s.face_registration_status]}`}>{s.face_registration_status}</span></td>
                <td>{s.encoding_count || 0}</td>
                <td>
                  <button onClick={() => openWebcam(s)} className="btn-primary btn-sm">
                    <CameraIcon className="w-3.5 h-3.5" /> {s.encoding_count > 0 ? 'Re-register' : 'Register Face'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showWebcam} onClose={closeWebcam} title={`Register Face — ${selectedStudent?.name}`} size="lg">
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />

            {/* Face guide oval */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-48 h-60 rounded-[50%] border-4 transition-colors duration-300 ${
                faceDetected ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]' : 'border-white/40'
              }`} />
            </div>

            {/* Status badge */}
            <div className={`absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${
              faceDetected ? 'bg-emerald-500/90 text-white' : 'bg-black/60 text-white'
            }`}>
              {faceDetected ? (
                <><CheckCircleIcon className="w-4 h-4" /> Face detected</>
              ) : (
                <><ExclamationTriangleIcon className="w-4 h-4" /> Position face in oval</>
              )}
            </div>

            <div className="absolute bottom-3 right-3 bg-black/60 text-white px-3 py-1 rounded-lg text-sm font-bold">
              {captures.length} / {TARGET_CAPTURES} valid
            </div>

            {(isCapturing || registering) && (
              <div className="absolute bottom-3 left-3 bg-black/60 text-white px-3 py-1 rounded-lg text-xs">
                {registering ? 'Saving encodings...' : 'Capturing when face detected...'}
              </div>
            )}
          </div>

          <div className="w-full bg-surface-200  rounded-full h-2 overflow-hidden">
            <div
              className="bg-surface-600 h-full transition-all duration-200"
              style={{ width: `${Math.min((captures.length / TARGET_CAPTURES) * 100, 100)}%` }}
            />
          </div>

          {captures.length > 0 && (
            <div className="grid grid-cols-8 gap-2 max-h-24 overflow-y-auto">
              {captures.slice(-16).map((c, i) => (
                <img key={i} src={c} className="w-full aspect-square object-cover rounded-lg" alt={`capture-${i}`} />
              ))}
            </div>
          )}

          {registrationErrors.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-600  space-y-1">
              <p className="font-semibold">Some frames could not be processed:</p>
              {registrationErrors.map((e, i) => <p key={i}>{e}</p>)}
              <button type="button" onClick={retryCapture} className="btn-secondary btn-sm mt-2">Try Again</button>
            </div>
          )}

          <p className="text-xs text-surface-500 text-center">
            Look at the camera inside the oval. Only frames with a detected face are saved.
            {` ${TARGET_CAPTURES} valid images are captured automatically, then registration runs.`}
          </p>
        </div>
      </Modal>
    </motion.div>
  );
}
