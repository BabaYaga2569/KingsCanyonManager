import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  InputAdornment,
  Alert,
  CircularProgress,
} from '@mui/material';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import Swal from 'sweetalert2';

const GoalsSettingsModal = ({ open, onClose, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState({
    annualRevenue: 150000,
    monthlyRevenue: 12500,
    jobsPerMonth: 50,
  });

  useEffect(() => {
    if (open) {
      loadGoals();
    }
  }, [open]);

  const loadGoals = async () => {
    try {
      setLoading(true);
      const goalsDoc = await getDoc(doc(db, 'settings', 'businessGoals'));
      
      if (goalsDoc.exists()) {
        setGoals(goalsDoc.data());
      } else {
        // Set defaults if no goals exist
        setGoals({
          annualRevenue: 150000,
          monthlyRevenue: 12500,
          jobsPerMonth: 50,
        });
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading goals:', error);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate inputs
      if (goals.annualRevenue <= 0 || goals.monthlyRevenue <= 0) {
        Swal.fire({
          icon: 'error',
          title: 'Invalid Goals',
          text: 'Revenue goals must be greater than zero',
        });
        setSaving(false);
        return;
      }

      // Save to Firebase
      await setDoc(doc(db, 'settings', 'businessGoals'), {
        annualRevenue: parseFloat(goals.annualRevenue),
        monthlyRevenue: parseFloat(goals.monthlyRevenue),
        jobsPerMonth: parseInt(goals.jobsPerMonth) || 0,
        updatedAt: new Date(),
      });

      setSaving(false);
      
      Swal.fire({
        icon: 'success',
        title: 'Goals Saved!',
        text: 'Your business goals have been updated',
        timer: 2000,
        showConfirmButton: false,
      });

      onSave(); // Trigger dashboard refresh
      onClose();
    } catch (error) {
      console.error('Error saving goals:', error);
      setSaving(false);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to save goals. Please try again.',
      });
    }
  };

  const handleChange = (field, value) => {
    setGoals(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateDailyTarget = () => {
    // Assume 22 working days per month
    return (goals.monthlyRevenue / 22).toFixed(2);
  };

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading goals...</Typography>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            ⚙️ Business Goals Settings
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          Set your revenue and job targets. These goals will be used across the dashboard.
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* ANNUAL REVENUE GOAL */}
          <TextField
            label="Annual Revenue Goal"
            type="number"
            value={goals.annualRevenue}
            onChange={(e) => handleChange('annualRevenue', e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            helperText="Your total revenue target for the year"
          />

          {/* MONTHLY REVENUE GOAL */}
          <TextField
            label="Monthly Revenue Goal"
            type="number"
            value={goals.monthlyRevenue}
            onChange={(e) => handleChange('monthlyRevenue', e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            helperText="Your target revenue per month"
          />

          {/* JOBS PER MONTH TARGET */}
          <TextField
            label="Jobs Per Month Target"
            type="number"
            value={goals.jobsPerMonth}
            onChange={(e) => handleChange('jobsPerMonth', e.target.value)}
            fullWidth
            helperText="Target number of completed jobs per month (optional)"
          />

          {/* AUTO-CALCULATED METRICS */}
          <Box sx={{ p: 2, backgroundColor: '#f5f5f5', borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              📊 Auto-Calculated Targets:
            </Typography>
            <Typography variant="body2">
              • Daily Revenue Target: <strong>${calculateDailyTarget()}</strong> (22 working days)
            </Typography>
            <Typography variant="body2">
              • Average Job Value: <strong>${goals.jobsPerMonth > 0 ? (goals.monthlyRevenue / goals.jobsPerMonth).toFixed(2) : '0'}</strong>
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={saving}
          startIcon={saving && <CircularProgress size={16} />}
        >
          {saving ? 'Saving...' : 'Save Goals'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GoalsSettingsModal;