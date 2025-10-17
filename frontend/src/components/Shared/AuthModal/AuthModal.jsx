import React, { useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose, onSuccess, initialMode = 'login', message }) => {
  const [mode, setMode] = useState(initialMode); // 'login', 'signup', 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        setSuccessMessage('Login successful!');
        setTimeout(() => {
          onSuccess && onSuccess(data.user, data.session);
          onClose();
        }, 1000);
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });

        if (error) throw error;

        setSuccessMessage('Sign up successful! Please check your email to verify your account.');
        setTimeout(() => {
          onSuccess && onSuccess(data.user, data.session);
          onClose();
        }, 2000);
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`
        });

        if (error) throw error;

        setSuccessMessage('Password reset email sent! Please check your inbox.');
        setTimeout(() => {
          setMode('login');
          setSuccessMessage(null);
        }, 2000);
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });

      if (error) throw error;
    } catch (err) {
      setError(err.message || 'Failed to login with Google');
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose}>&times;</button>

        <div className="auth-modal-header">
          <h2>
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'reset' && 'Reset Password'}
          </h2>
          {message && <p className="auth-modal-message">{message}</p>}
        </div>

        <div className="auth-modal-content">
          {error && <div className="auth-error">{error}</div>}
          {successMessage && <div className="auth-success">{successMessage}</div>}

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  disabled={loading}
                />
              </div>
            )}

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            {mode !== 'reset' && (
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={loading}
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary auth-submit-btn" disabled={loading}>
              {loading ? 'Please wait...' : (
                mode === 'login' ? 'Log In' :
                mode === 'signup' ? 'Sign Up' :
                'Send Reset Email'
              )}
            </button>
          </form>

          {mode !== 'reset' && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="btn btn-google"
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                  <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                  <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
                  <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          <div className="auth-modal-footer">
            {mode === 'login' && (
              <>
                <p>
                  Don't have an account?{' '}
                  <button className="auth-link" onClick={() => setMode('signup')}>
                    Sign up
                  </button>
                </p>
                <p>
                  <button className="auth-link" onClick={() => setMode('reset')}>
                    Forgot password?
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p>
                Already have an account?{' '}
                <button className="auth-link" onClick={() => setMode('login')}>
                  Log in
                </button>
              </p>
            )}
            {mode === 'reset' && (
              <p>
                <button className="auth-link" onClick={() => setMode('login')}>
                  Back to login
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
