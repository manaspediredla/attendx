import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import {
  initTabAuth,
  getAccessToken,
  getStoredUser,
  setAuth,
  clearTabAuth,
  hasActiveTabSession,
} from '../utils/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  initTabAuth();

  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getAccessToken());
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    if (getAccessToken() && hasActiveTabSession()) {
      fetchUser();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      if (res.data.student) {
        setStudentId(res.data.student.internal_id);
      }
      setMustChangePassword(res.data.must_change_password || false);
    } catch {
      clearTabAuth();
      setToken(null);
      setUser(null);
      setStudentId(null);
    } finally {
      setLoading(false);
    }
  };

  const completeAuth = (data) => {
    const { access_token, refresh_token, user: userData, student_id } = data;
    setAuth({ access_token, refresh_token, user: userData });
    setToken(access_token);
    setUser(userData);
    setLoading(false);
    setMustChangePassword(data.must_change_password || false);
    if (student_id) setStudentId(student_id);
    return userData;
  };

  /** Step 1: email + password */
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const data = res.data;

    if (data.step === 'complete') {
      return completeAuth(data);
    }

    return data;
  };

  /** Step 2a: student face enrollment (first login) */
  const enrollFace = async (faceChallengeToken, images) => {
    const res = await api.post('/auth/enroll-face', {
      face_challenge_token: faceChallengeToken,
      images,
    });
    return completeAuth(res.data);
  };

  /** Step 2b: student face verification (every login) */
  const verifyLoginFace = async (faceChallengeToken, images) => {
    const res = await api.post('/auth/verify-login-face', {
      face_challenge_token: faceChallengeToken,
      images,
    });
    return completeAuth(res.data);
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => {});
    clearTabAuth();
    setToken(null);
    setUser(null);
    setStudentId(null);
    setMustChangePassword(false);
  };

  const passwordChanged = () => {
    setMustChangePassword(false);
    if (user) {
      setUser({ ...user, must_change_password: false });
    }
  };

  const value = {
    user,
    token,
    studentId,
    loading,
    login,
    enrollFace,
    verifyLoginFace,
    logout,
    mustChangePassword,
    passwordChanged,
    isSuperAdmin: user?.role === 'super_admin',
    isTeacher: user?.role === 'teacher',
    isStudent: user?.role === 'student',
    isAuthenticated: !!token && !!user && hasActiveTabSession(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
