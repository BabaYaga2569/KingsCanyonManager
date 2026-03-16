import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, TextField, Button, Paper,
  CircularProgress, Alert, Divider, InputAdornment, IconButton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const acceptInviteFn = httpsCallable(functions, 'acceptEmployeeInvite');

export default function InviteSignup() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');
  const [invite, setInvite]       = useState(null);

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);

  // Load and validate the invite token
  useEffect(() => {
    const loadInvite = async () => {
      try {
        if (!token) { setError('Invalid invite link.'); setLoading(false); return; }
        const inviteDoc = await getDoc(doc(db, 'invites', token));
        if (!inviteDoc.exists()) { setError('This invite link is invalid or has already been used.'); setLoading(false); return; }
        const data = inviteDoc.data();
        if (data.used) { setError('This invite has already been used. Please ask your manager to send a new one.'); setLoading(false); return; }
        if (new Date(data.expiresAt) < new Date()) { setError('This invite link has expired (72 hours). Please ask your manager to send a new invite.'); setLoading(false); return; }
        setInvite(data);
      } catch (err) {
        console.error('Error loading invite:', err);
        setError('Failed to load invite: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    loadInvite();
  }, [token]);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await acceptInviteFn({ token, password });
      setDone(true);
    } catch (err) {
      console.error('Error accepting invite:', err);
      setError('Failed to create account: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── LOADING ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress size={48} />
        <Typography sx={{ mt: 2 }}>Verifying your invite...</Typography>
      </Container>
    );
  }

  // ── ERROR ────────────────────────────────────────────────────────────────────
  if (error && !invite) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" color="error" gutterBottom>Invite Problem</Typography>
          <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
          <Typography variant="body2" color="text.secondary">
            Contact your manager to request a new invite link.
          </Typography>
        </Paper>
      </Container>
    );
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight="bold" gutterBottom>Account Created!</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Your account is ready. Log in with your email address and the password you just set.
            You will be asked to sign a company NDA before accessing the app.
          </Typography>
          <Button
            variant="contained" size="large" fullWidth
            onClick={() => navigate('/')}
          >
            Go to Login
          </Button>
        </Paper>
      </Container>
    );
  }

  // ── MAIN FORM ────────────────────────────────────────────────────────────────
  return (
    <Container maxWidth="sm" sx={{ mt: { xs: 4, sm: 8 }, px: { xs: 2, sm: 3 } }}>
      <Paper sx={{ p: { xs: 3, sm: 4 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <LockIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight="bold">Welcome to KCL Manager</Typography>
          <Typography color="text.secondary" variant="body2">
            You've been invited to join the team
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Invite details */}
        <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mb: 3 }}>
          <Typography variant="body2" color="text.secondary">Invited as</Typography>
          <Typography variant="h6" fontWeight="bold">{invite?.name}</Typography>
          <Typography variant="body2">{invite?.email}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ bgcolor: 'primary.100', px: 1, py: 0.25, borderRadius: 1, bgcolor: '#e3f2fd' }}>
              {invite?.jobTitle || 'Team Member'}
            </Typography>
            <Typography variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: '#e8f5e9' }}>
              {invite?.employmentType === 'salary' ? 'Salaried' : 'Hourly'}
            </Typography>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Create a password to finish setting up your account. You'll use your email address and this password to log in.
        </Typography>

        {/* Password fields */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            label="Create Password"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            helperText="At least 8 characters"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPw(!showPw)} edge="end">
                    {showPw ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            label="Confirm Password"
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            error={confirm.length > 0 && password !== confirm}
            helperText={confirm.length > 0 && password !== confirm ? 'Passwords do not match' : ''}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}

        <Button
          variant="contained" size="large" fullWidth
          sx={{ mt: 3 }}
          onClick={handleSubmit}
          disabled={submitting || !password || !confirm}
          startIcon={submitting ? <CircularProgress size={18} /> : <CheckCircleIcon />}
        >
          {submitting ? 'Creating Account...' : 'Create My Account'}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
          After creating your account you will be asked to sign a company NDA before accessing the app.
        </Typography>
      </Paper>
    </Container>
  );
}