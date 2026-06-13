import { useState, useRef, useEffect } from 'react';
import api from '../../api/axios';

export default function AttendanceSession() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);
  const sessionRef = useRef(null);
  const processingRef = useRef(false); // Lock to prevent overlapping API calls

  const [session, setSession] = useState(null);
  const [subject, setSubject] = useState('');
  const [section, setSection] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [liveResults, setLiveResults] = useState([]);
  const [annotatedImage, setAnnotatedImage] = useState(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [scanCount, setScanCount] = useState(0);
  const [faceCount, setFaceCount] = useState(0);

  // Keep sessionRef in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Check for active sessions on mount
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const res = await api.get('/attendance/sessions?status=active');
        const activeSessions = res.data.sessions || [];
        if (activeSessions.length > 0) {
          const active = activeSessions[0];
          setSession(active);
          sessionRef.current = active;
          setStatusMsg(`⚡ Resuming active session: ${active.subject} — Section ${active.section}. Open camera to continue.`);
        }
      } catch (err) {
        console.error('Failed to check active sessions:', err);
      }
    };
    checkActiveSession();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startSession = async () => {
    if (!subject || !section) {
      setError('Please enter subject and section');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/attendance/start', { subject, section });
      setSession(res.data.session);
      sessionRef.current = res.data.session;
      setStatusMsg('Session started! Opening webcam...');
      await startCamera();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    setLoading(true);
    try {
      stopRecognition();
      stopCamera();
      await api.post('/attendance/end', { session_id: session.id });
      setSession(null);
      sessionRef.current = null;
      setLiveResults([]);
      setCameraReady(false);
      setStatusMsg('');
      setScanCount(0);
      setFaceCount(0);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to end session');
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
          setStatusMsg('📷 Camera ready! Click "Start Recognition" to begin.');
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access webcam. Please allow camera permission.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  };

  const captureAndRecognize = async () => {
    // Skip if already processing a previous frame
    if (processingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const currentSession = sessionRef.current;

    if (!video || !canvas || !currentSession) return;
    if (video.readyState < 2) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return;

    processingRef.current = true;

    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, vw, vh);
    const frame = canvas.toDataURL('image/jpeg', 0.7);

    try {
      const res = await api.post('/attendance/recognize', {
        session_id: currentSession.id,
        image: frame,
      });

      setScanCount((prev) => prev + 1);

      const faces = res.data.face_count || 0;
      const markedCount = res.data.marked?.length || 0;
      setFaceCount(faces);

      // Show annotated image with bounding boxes
      if (res.data.annotated_image) {
        setAnnotatedImage(res.data.annotated_image);
      }

      if (faces > 0) {
        setStatusMsg(`🎯 Detected ${faces} face(s), matched ${markedCount}`);
      } else {
        setStatusMsg('👀 No faces detected — look at the camera');
      }

      if (res.data.marked?.length > 0) {
        setLiveResults((prev) => {
          const existing = new Set(prev.map((r) => r.student_id));
          const newResults = res.data.marked.filter((r) => !existing.has(r.student_id));
          return [...prev, ...newResults];
        });
      }
    } catch (err) {
      console.error('Recognition error:', err.response?.data || err.message);
    } finally {
      processingRef.current = false;
    }
  };

  const startRecognition = () => {
    if (!cameraReady) {
      setError('Camera is not ready yet.');
      return;
    }
    setIsRecognizing(true);
    setScanCount(0);
    setStatusMsg('🔍 Recognition active...');
    captureAndRecognize();
    intervalRef.current = setInterval(captureAndRecognize, 3000);
  };

  const stopRecognition = () => {
    setIsRecognizing(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatusMsg('⏸️ Recognition paused');
  };

  return (
    <div className="page-content">
      <h2 className="page-title">📷 Attendance Session</h2>

      {error && (
        <div className="alert alert--error" style={{ cursor: 'pointer' }} onClick={() => setError('')}>
          ⚠️ {error}
        </div>
      )}

      {/* Start Session Form */}
      {!session && (
        <div className="form-card">
          <h3 style={{ marginBottom: 16 }}>Start New Attendance Session</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Subject *</label>
              <input
                className="form-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Data Structures"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Section *</label>
              <select className="form-input" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">Select Section</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
          </div>
          <button className="btn btn--primary" onClick={startSession} disabled={loading}>
            {loading ? '⏳ Starting...' : '▶️ Start Attendance Session'}
          </button>
        </div>
      )}

      {/* Active Session */}
      {session && (
        <div className="attendance-live">
          {/* Sticky Header — always visible */}
          <div className="attendance-live__header">
            <div className="attendance-live__info">
              <span className="badge badge--active">🔴 Live</span>
              <span style={{ fontWeight: 600 }}>
                {session.subject} — Section {session.section}
              </span>
              {isRecognizing && (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  Scans: {scanCount} | Faces: {faceCount}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!cameraReady && !streamRef.current && (
                <button className="btn btn--primary" onClick={startCamera} style={{ fontSize: 13, padding: '8px 16px' }}>
                  📷 Open Camera
                </button>
              )}
              <button className="btn btn--danger" onClick={endSession} disabled={loading}>
                ⏹️ End Session
              </button>
            </div>
          </div>

          {/* Status bar */}
          {statusMsg && (
            <div style={{
              background: 'rgba(59,130,246,0.08)',
              color: '#93c5fd',
              border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 10,
              padding: '10px 16px',
              marginBottom: 16,
              fontSize: 14,
            }}>
              {statusMsg}
            </div>
          )}

          <div className="attendance-live__content">
            {/* Video Feed — always shows live video, never replaced */}
            <div className="attendance-live__video" style={{ position: 'relative' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="attendance-live__video-element"
                style={{ display: annotatedImage && isRecognizing ? 'none' : 'block' }}
              />
              {annotatedImage && isRecognizing && (
                <img
                  src={annotatedImage}
                  alt="Recognition"
                  className="attendance-live__video-element"
                />
              )}
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <div className="attendance-live__controls">
                {!isRecognizing ? (
                  <button
                    className="btn btn--success"
                    onClick={startRecognition}
                    disabled={!cameraReady}
                  >
                    {cameraReady ? '🎯 Start Recognition' : '⏳ Waiting for camera...'}
                  </button>
                ) : (
                  <button className="btn btn--warning" onClick={stopRecognition}>
                    ⏸️ Pause Recognition
                  </button>
                )}
              </div>
            </div>

            {/* Live Results */}
            <div className="attendance-live__results">
              <h3>✅ Recognized ({liveResults.length})</h3>
              <div className="attendance-live__list">
                {liveResults.length === 0 ? (
                  <p style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                    {isRecognizing
                      ? 'Scanning... look at the camera'
                      : 'Click "Start Recognition" to begin'}
                  </p>
                ) : (
                  liveResults.map((r, idx) => (
                    <div key={idx} className="attendance-live__result-item">
                      <div className="attendance-live__result-rank">{idx + 1}</div>
                      <div className="attendance-live__result-info">
                        <span className="attendance-live__result-name">{r.student_name}</span>
                        <span className="attendance-live__result-confidence">
                          {(r.confidence * 100).toFixed(1)}% confidence
                        </span>
                      </div>
                      <span className={`badge ${r.status === 'newly_marked' ? 'badge--success' : 'badge--info'}`}>
                        {r.status === 'newly_marked' ? '✅' : 'ℹ️'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
