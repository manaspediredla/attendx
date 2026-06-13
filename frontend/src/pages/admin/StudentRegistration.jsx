import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

export default function StudentRegistration() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [step, setStep] = useState(1); // 1: Form, 2: Face Capture, 3: Done
  const [formData, setFormData] = useState({
    name: '', email: '', roll_number: '', department: '',
    section: '', year: '', phone: '', password: '',
  });
  const [studentId, setStudentId] = useState(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationResult, setRegistrationResult] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/students', formData);
      setStudentId(res.data.student.id);
      setStep(2);
      startCamera();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create student');
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setError('Unable to access webcam. Please grant camera permission.');
    }
  };

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  const startAutoCapture = () => {
    setIsCapturing(true);
    setCapturedImages([]);
    let count = 0;
    const maxCaptures = 40;

    const interval = setInterval(() => {
      const frame = captureFrame();
      if (frame) {
        setCapturedImages((prev) => [...prev, frame]);
        count++;
      }
      if (count >= maxCaptures) {
        clearInterval(interval);
        setIsCapturing(false);
      }
    }, 300); // Capture every 300ms
  };

  const handleRegisterFaces = async () => {
    if (capturedImages.length < 10) {
      setError('Need at least 10 images. Please capture more.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/faces/register', {
        student_id: studentId,
        images: capturedImages,
      });
      setRegistrationResult(res.data);
      stopCamera();
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register faces');
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  return (
    <div className="page-content">
      <h2 className="page-title">Student Registration</h2>

      {/* Progress Steps */}
      <div className="steps">
        <div className={`steps__item ${step >= 1 ? 'steps__item--active' : ''}`}>
          <span className="steps__number">1</span>
          <span className="steps__label">Student Info</span>
        </div>
        <div className="steps__connector"></div>
        <div className={`steps__item ${step >= 2 ? 'steps__item--active' : ''}`}>
          <span className="steps__number">2</span>
          <span className="steps__label">Face Capture</span>
        </div>
        <div className="steps__connector"></div>
        <div className={`steps__item ${step >= 3 ? 'steps__item--active' : ''}`}>
          <span className="steps__number">3</span>
          <span className="steps__label">Complete</span>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {/* Step 1: Student Form */}
      {step === 1 && (
        <div className="form-card">
          <form onSubmit={handleSubmitForm}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input name="name" className="form-input" value={formData.name}
                  onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input name="email" type="email" className="form-input" value={formData.email}
                  onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Roll Number *</label>
                <input name="roll_number" className="form-input" value={formData.roll_number}
                  onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Department *</label>
                <select name="department" className="form-input" value={formData.department}
                  onChange={handleChange} required>
                  <option value="">Select Department</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Civil">Civil</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Information Technology">Information Technology</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Section *</label>
                <select name="section" className="form-input" value={formData.section}
                  onChange={handleChange} required>
                  <option value="">Select Section</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Year *</label>
                <select name="year" className="form-input" value={formData.year}
                  onChange={handleChange} required>
                  <option value="">Select Year</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input name="phone" className="form-input" value={formData.phone}
                  onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Password (default: roll number)</label>
                <input name="password" className="form-input" value={formData.password}
                  onChange={handleChange} placeholder="Leave blank for roll number" />
              </div>
            </div>

            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Creating...' : 'Next: Capture Face →'}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Face Capture */}
      {step === 2 && (
        <div className="face-capture">
          <div className="face-capture__video-container">
            <video ref={videoRef} autoPlay playsInline muted className="face-capture__video" />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {isCapturing && (
              <div className="face-capture__overlay">
                <div className="face-capture__progress">
                  Capturing... {capturedImages.length}/40
                </div>
              </div>
            )}
          </div>

          <div className="face-capture__controls">
            <p className="face-capture__instructions">
              Position your face clearly in the camera. Move your head slightly between captures
              for different angles. We'll capture 40 images automatically.
            </p>

            <div className="face-capture__count">
              📸 Captured: <strong>{capturedImages.length}</strong> / 40 images
            </div>

            <div className="face-capture__buttons">
              {!isCapturing && capturedImages.length < 40 && (
                <button className="btn btn--primary" onClick={startAutoCapture}>
                  📷 Start Auto-Capture
                </button>
              )}

              {capturedImages.length > 0 && !isCapturing && (
                <>
                  <button className="btn btn--secondary" onClick={() => setCapturedImages([])}>
                    🔄 Reset
                  </button>
                  <button className="btn btn--success" onClick={handleRegisterFaces} disabled={loading}>
                    {loading ? '⏳ Registering...' : `✅ Register ${capturedImages.length} Images`}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Image Preview Grid */}
          {capturedImages.length > 0 && (
            <div className="face-capture__preview">
              {capturedImages.slice(-8).map((img, idx) => (
                <img key={idx} src={img} alt={`Capture ${idx + 1}`} className="face-capture__thumb" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Complete */}
      {step === 3 && (
        <div className="registration-complete">
          <div className="registration-complete__icon">✅</div>
          <h3>Registration Complete!</h3>
          <p>Student has been registered with {registrationResult?.stored_count || 0} face encodings.</p>

          {registrationResult?.errors?.length > 0 && (
            <div className="alert alert--warning">
              <p>Some images had issues:</p>
              <ul>
                {registrationResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="registration-complete__actions">
            <button className="btn btn--primary" onClick={() => {
              setStep(1);
              setFormData({ name: '', email: '', roll_number: '', department: '', section: '', year: '', phone: '', password: '' });
              setCapturedImages([]);
              setStudentId(null);
              setRegistrationResult(null);
            }}>
              Register Another Student
            </button>
            <button className="btn btn--secondary" onClick={() => navigate('/admin/students')}>
              View All Students
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
