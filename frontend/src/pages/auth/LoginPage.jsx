import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import AttendXLogo, { AttendXLogoText } from '../../components/common/AttendXLogo';

const SCAN_INTERVAL_MS = 600;
const VERIFY_FRAMES = 3;

function Particles() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: `${Math.random() * 100}%`,
      duration: `${12 + Math.random() * 18}s`,
      delay: `${Math.random() * 15}s`,
      size: `${2 + Math.random() * 3}px`,
      opacity: 0.1 + Math.random() * 0.2,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div key={p.id} className="particle" style={{
          '--x': p.x, '--duration': p.duration, '--delay': p.delay,
          width: p.size, height: p.size, opacity: p.opacity,
          left: p.x, animationDuration: p.duration, animationDelay: p.delay,
        }} />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { login, enrollFace, verifyLoginFace } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [faceChallengeToken, setFaceChallengeToken] = useState(null);
  const [faceStep, setFaceStep] = useState(null);
  const [minImages, setMinImages] = useState(20);
  const [recommendedImages, setRecommendedImages] = useState(30);
  const [capturedImages, setCapturedImages] = useState([]);
  const [verifyFrames, setVerifyFrames] = useState([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanRef = useRef(null);
  const canvasRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (scanRef.current) clearInterval(scanRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      toast.error('Camera permission required');
    }
  };

  const startFaceScan = useCallback((token, mode) => {
    if (scanRef.current) clearInterval(scanRef.current);
    scanRef.current = setInterval(async () => {
      const frame = captureFrame();
      if (!frame) return;
      const base64 = frame.split(',')[1];

      try {
        const res = await api.post('/auth/detect-face', {
          image: base64,
          face_challenge_token: token,
        });
        setFaceDetected(res.data.face_detected);

        if (mode === 'enrollment' && res.data.face_detected) {
          setCapturedImages(prev => {
            if (prev.length >= 50) return prev;
            return [...prev, base64];
          });
        }

        if (mode === 'verification' && res.data.face_detected) {
          setVerifyFrames(prev => {
            const next = [...prev, base64];
            return next.length > 10 ? next.slice(-10) : next;
          });
        }
      } catch { /* ignore scan errors */ }
    }, SCAN_INTERVAL_MS);
  }, [captureFrame]);

  useEffect(() => {
    if ((faceStep === 'enrollment' || faceStep === 'verification') && cameraReady && faceChallengeToken) {
      startFaceScan(faceChallengeToken, faceStep);
    }
    return () => { if (scanRef.current) clearInterval(scanRef.current); };
  }, [faceStep, cameraReady, faceChallengeToken, startFaceScan]);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);

      if (result.step === 'face_enrollment') {
        setFaceChallengeToken(result.face_challenge_token);
        setMinImages(result.min_images || 20);
        setRecommendedImages(result.recommended_images || 30);
        setFaceStep('enrollment');
        setStep('face');
        setCapturedImages([]);
        await startCamera();
        return;
      }

      if (result.step === 'face_verification') {
        setFaceChallengeToken(result.face_challenge_token);
        setFaceStep('verification');
        setStep('face');
        setVerifyFrames([]);
        await startCamera();
        return;
      }

      toast.success('Welcome to ATTENDX');
      navigateToRole(result.role);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const navigateToRole = (role) => {
    const paths = { super_admin: '/superadmin', teacher: '/teacher', student: '/student' };
    navigate(paths[role] || '/login', { replace: true });
  };

  const handleEnrollSubmit = async () => {
    if (capturedImages.length < minImages) {
      toast.error(`Need at least ${minImages} face images (have ${capturedImages.length})`);
      return;
    }
    setLoading(true);
    try {
      const userData = await enrollFace(faceChallengeToken, capturedImages);
      stopCamera();
      toast.success('Face enrollment complete');
      navigateToRole(userData.role);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Face enrollment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async () => {
    const frames = verifyFrames.slice(-VERIFY_FRAMES);
    if (frames.length < VERIFY_FRAMES) {
      toast.error(`Hold still — capturing face (${frames.length}/${VERIFY_FRAMES})`);
      return;
    }
    setLoading(true);
    try {
      const userData = await verifyLoginFace(faceChallengeToken, frames);
      stopCamera();
      toast.success('Identity verified — welcome');
      navigateToRole(userData.role);
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Face Verification Failed');
    } finally {
      setLoading(false);
    }
  };

  const enrollProgress = Math.min((capturedImages.length / minImages) * 100, 100);
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#0E1117' }}>
      {/* ── Looping Video Background ── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'brightness(0.55) saturate(0.9)' }}
      >
        <source src={`${import.meta.env.BASE_URL}videos/login-bg.mp4`} type="video/mp4" />
        <source src={`${import.meta.env.BASE_URL}videos/login-bg.mov`} type="video/quicktime" />
      </video>
      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0E1117]/40 via-[#0E1117]/25 to-[#0E1117]/40" />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 w-full max-w-[960px] flex rounded-3xl overflow-hidden shadow-2xl"
        style={{ minHeight: '540px' }}
      >
        {/* ── LEFT PANEL: Branding ── */}
        <div
          className="hidden md:flex flex-col justify-between w-[45%] p-10 relative overflow-hidden backdrop-blur-md"
          style={{ background: 'linear-gradient(160deg, rgba(22,27,34,0.85), rgba(14,17,23,0.9))' }}
        >
          {/* Logo & Tagline */}
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-2">
                <AttendXLogo size={72} />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight mt-4">
                <span className="text-surface-200">ATTEND</span>
                <span
                  className="text-surface-400 font-black"
                  style={{ fontSize: '1.1em', filter: 'drop-shadow(0 0 8px rgba(141,150,165,0.3))' }}
                >X</span>
              </h1>
              <p className="text-surface-500 text-sm font-light mt-4 leading-relaxed tracking-wide">
                Intelligent Presence<br />Verification Platform
              </p>
            </motion.div>
          </div>

          {/* Abstract Wave Mesh - SVG */}
          <div className="absolute bottom-0 left-0 right-0 h-[55%] pointer-events-none z-0">
            <svg viewBox="0 0 400 250" fill="none" className="w-full h-full" preserveAspectRatio="xMidYMax slice">
              {/* Main flowing waves */}
              <path d="M0 180 C50 140, 100 200, 150 160 S250 120, 300 170 S380 130, 400 150 L400 250 L0 250Z" fill="rgba(42,50,64,0.2)" />
              <path d="M0 200 C60 160, 120 220, 180 180 S260 140, 320 190 S390 150, 400 170 L400 250 L0 250Z" fill="rgba(42,50,64,0.15)" />
              <path d="M0 220 C70 190, 130 230, 200 200 S280 170, 340 210 S395 180, 400 195 L400 250 L0 250Z" fill="rgba(42,50,64,0.1)" />
              {/* Flowing lines */}
              <path d="M0 170 C60 130, 120 190, 180 150 S260 110, 320 160 S390 120, 400 140" stroke="rgba(141,150,165,0.12)" strokeWidth="1" fill="none" />
              <path d="M0 185 C55 150, 115 200, 175 165 S255 125, 315 175 S385 135, 400 155" stroke="rgba(141,150,165,0.08)" strokeWidth="0.8" fill="none" />
              <path d="M0 195 C65 165, 125 210, 185 175 S265 145, 325 185 S390 155, 400 165" stroke="rgba(141,150,165,0.1)" strokeWidth="0.8" fill="none" />
              <path d="M0 205 C70 175, 135 215, 195 185 S275 155, 335 195 S395 165, 400 175" stroke="rgba(141,150,165,0.06)" strokeWidth="0.6" fill="none" />
              <path d="M0 215 C75 185, 140 225, 205 195 S285 165, 345 205 S398 175, 400 185" stroke="rgba(141,150,165,0.08)" strokeWidth="0.6" fill="none" />
              {/* Mesh grid dots */}
              {[...Array(5)].map((_, row) => (
                [...Array(8)].map((_, col) => (
                  <circle
                    key={`${row}-${col}`}
                    cx={col * 55 + 15}
                    cy={150 + row * 22}
                    r="0.8"
                    fill={`rgba(141,150,165,${0.06 + Math.random() * 0.08})`}
                  />
                ))
              ))}
            </svg>
          </div>

          {/* Subtle ambient glow */}
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full blur-[100px] opacity-30 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(141,150,165,0.08), transparent 70%)' }} />
        </div>

        {/* ── RIGHT PANEL: Login Form ── */}
        <div
          className="flex-1 flex flex-col justify-center p-10 md:p-12 relative backdrop-blur-md"
          style={{ background: 'linear-gradient(160deg, rgba(28,34,43,0.88), rgba(22,27,34,0.92))' }}
        >
          {step === 'credentials' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold text-surface-100 mb-1">Welcome Back</h2>
              <p className="text-surface-500 text-sm mb-8">Sign in to continue</p>

              <form onSubmit={handleCredentials} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-2">Email or Student ID</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm text-surface-200 placeholder:text-surface-600 transition-all duration-200 outline-none"
                    style={{ background: '#252B35', border: '1px solid #333B48' }}
                    onFocus={(e) => { e.target.style.borderColor = '#8D96A5'; e.target.style.boxShadow = '0 0 0 2px rgba(141,150,165,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#333B48'; e.target.style.boxShadow = 'none'; }}
                    placeholder="Enter your email or student ID"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-surface-200 placeholder:text-surface-600 transition-all duration-200 outline-none"
                      style={{ background: '#252B35', border: '1px solid #333B48' }}
                      onFocus={(e) => { e.target.style.borderColor = '#8D96A5'; e.target.style.boxShadow = '0 0 0 2px rgba(141,150,165,0.1)'; }}
                      onBlur={(e) => { e.target.style.borderColor = '#333B48'; e.target.style.boxShadow = 'none'; }}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                    >
                      {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Remember me + Forgot Password */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-surface-600 bg-transparent text-surface-500 focus:ring-surface-500/30 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs text-surface-400 group-hover:text-surface-300 transition-colors">Remember me</span>
                  </label>
                  <button type="button" className="text-xs text-surface-400 hover:text-surface-200 transition-colors">
                    Forgot Password?
                  </button>
                </div>

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-surface-200 transition-all duration-300 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #2A3240, #374151)',
                    border: '1px solid rgba(141,150,165,0.15)',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'linear-gradient(135deg, #374151, #4B5563)'; e.target.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'linear-gradient(135deg, #2A3240, #374151)'; e.target.style.transform = 'translateY(0)'; }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="spinner w-4 h-4" />
                      Authenticating...
                    </span>
                  ) : 'Sign In'}
                </button>
              </form>

              {/* Footer */}
              <p className="text-center text-xs text-surface-500 mt-8">
                Don't have an account? <span className="text-surface-300 font-medium cursor-pointer hover:text-surface-100 transition-colors">Contact Admin</span>
              </p>
            </motion.div>
          )}

          {step === 'face' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-2xl font-bold text-surface-100 mb-1">
                  {faceStep === 'enrollment' ? 'Face Enrollment' : 'Verify Identity'}
                </h2>
                <p className="text-surface-500 text-sm">
                  {faceStep === 'enrollment' ? 'First login — register your face' : 'Look at the camera for verification'}
                </p>
              </div>

              <div className="relative rounded-2xl overflow-hidden bg-surface-950 aspect-video border border-surface-700/40">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <div className={`absolute inset-0 border-2 rounded-2xl pointer-events-none transition-colors duration-300 ${faceDetected ? 'border-emerald-500/50' : 'border-red-500/30'}`} />
                {faceDetected && (
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>

              {faceStep === 'enrollment' && (
                <>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-surface-400 font-medium">{capturedImages.length} / {minImages} images</span>
                      <span className="text-surface-500">{Math.round(enrollProgress)}%</span>
                    </div>
                    <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #4B5563, #8D96A5)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${enrollProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-surface-500 text-[11px] mt-1.5">Recommended: {recommendedImages}–50 from multiple angles</p>
                  </div>
                  <button
                    onClick={handleEnrollSubmit}
                    disabled={loading || capturedImages.length < minImages}
                    className="btn-primary w-full py-3"
                  >
                    {loading ? 'Enrolling...' : 'Complete Enrollment'}
                  </button>
                </>
              )}

              {faceStep === 'verification' && (
                <>
                  <div className="text-center">
                    <p className="text-surface-200 font-semibold text-sm">
                      Frames: {Math.min(verifyFrames.length, VERIFY_FRAMES)} / {VERIFY_FRAMES}
                    </p>
                    <p className="text-surface-500 text-xs mt-1">Look at the camera with good lighting</p>
                  </div>
                  <button
                    onClick={handleVerifySubmit}
                    disabled={loading || verifyFrames.length < VERIFY_FRAMES}
                    className="btn-primary w-full py-3"
                  >
                    {loading ? 'Verifying...' : 'Verify Identity'}
                  </button>
                </>
              )}

              <p className="text-center text-[11px] text-surface-600">Face verification cannot be skipped</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

