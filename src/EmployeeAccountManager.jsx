import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, Grid, IconButton, InputLabel,
  MenuItem, Paper, Select, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography, Chip, Alert, CircularProgress,
  ButtonGroup, Switch, FormControlLabel, InputAdornment, Tabs, Tab, Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  Send as SendIcon,
  Email as EmailIcon,
  Work as WorkIcon,
} from '@mui/icons-material';
import { db, auth } from './firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, where,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Swal from 'sweetalert2';
import generateEmployeeNDAPDF from './pdf/generateEmployeeNDAPDF';

const functions = getFunctions();
const sendEmployeeInviteFn = httpsCallable(functions, 'sendEmployeeInvite');

// ── Helper: calculate salary per pay period ──────────────────────────────────
function calcPerPeriod(annualSalary, paySchedule) {
  const s = parseFloat(annualSalary) || 0;
  return paySchedule === 'biweekly' ? (s / 26).toFixed(2) : (s / 24).toFixed(2);
}

// ── EmploymentFields must be defined OUTSIDE EmployeeAccountManager
// so React doesn't remount it on every keystroke (which kills input focus)
const EmploymentFields = ({ form, setForm }) => (
  <>
    <Grid item xs={12} sm={6}>
      <TextField select fullWidth label="Employment Type"
        value={form.employmentType || 'hourly'}
        onChange={e => setForm({ ...form, employmentType: e.target.value })}>
        <MenuItem value="hourly">Hourly (tracks time, clocks in)</MenuItem>
        <MenuItem value="salary">Salary (fixed pay, no clock-in required)</MenuItem>
      </TextField>
    </Grid>

    {(form.employmentType || 'hourly') === 'hourly' && (
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Hourly Rate *" type="number"
          value={form.hourlyRate || ''}
          onChange={e => setForm({ ...form, hourlyRate: e.target.value })}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
      </Grid>
    )}

    {(form.employmentType || 'hourly') === 'salary' && (
      <>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="Annual Salary *" type="number"
            value={form.annualSalary || ''}
            onChange={e => setForm({ ...form, annualSalary: e.target.value })}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            helperText={form.annualSalary
              ? `$${calcPerPeriod(form.annualSalary, form.paySchedule)} per pay period`
              : ''} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField select fullWidth label="Pay Schedule"
            value={form.paySchedule || 'semi-monthly'}
            onChange={e => setForm({ ...form, paySchedule: e.target.value })}>
            <MenuItem value="semi-monthly">Semi-Monthly (15th &amp; 30th — 24/yr)</MenuItem>
            <MenuItem value="biweekly">Bi-Weekly (every 2 weeks — 26/yr)</MenuItem>
          </TextField>
        </Grid>
      </>
    )}

    {(form.employmentType || 'hourly') === 'hourly' && (
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch checked={form.requireGps !== false}
              onChange={e => setForm({ ...form, requireGps: e.target.checked })} color="primary" />
          }
          label={
            <Box>
              <Typography variant="body2" fontWeight="bold">Require GPS Clock-In</Typography>
              <Typography variant="caption" color="text.secondary">
                {form.requireGps !== false
                  ? 'Must be within 500ft of job site to clock in'
                  : 'GPS not required (for office/admin staff)'}
              </Typography>
            </Box>
          }
        />
      </Grid>
    )}
  </>
);

const EmployeeAccountManager = ({ currentUser, currentUserRole }) => {
  const [employees, setEmployees]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState('active');
  const [activeTab, setActiveTab]       = useState(0); // 0=employees, 1=pending invites

  // ── Old-style Add/Edit dialog ─────────────────────────────────────────────
  const [openDialog, setOpenDialog]         = useState(false);
  const [editMode, setEditMode]             = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', role: 'crew',
    jobTitle: 'Crew Member', phoneNumber: '', hourlyRate: '',
    employmentType: 'hourly', annualSalary: '', paySchedule: 'semi-monthly',
    requireGps: true,
  });

  // ── Invite dialog ─────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen]     = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '', email: '', role: 'crew', jobTitle: 'Crew Member',
    phoneNumber: '', employmentType: 'hourly', hourlyRate: '',
    annualSalary: '', paySchedule: 'semi-monthly', requireGps: true,
  });

  // ── NDA Viewer ────────────────────────────────────────────────────────────
  const [ndaViewerOpen, setNdaViewerOpen] = useState(false);
  const [viewingNDA, setViewingNDA]       = useState(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [logoDataUrl, setLogoDataUrl]     = useState(null);

  // ── Load pending invites (not yet accepted) ───────────────────────────────
  const [pendingInvites, setPendingInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

  // ── Load logo for PDF ─────────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        setLogoDataUrl(canvas.toDataURL('image/png'));
      } catch (e) { setLogoDataUrl(null); }
    };
    img.src = '/logo-kcl.png';
  }, []);

  useEffect(() => {
    if (currentUserRole === 'god') {
      loadEmployees();
      loadPendingInvites();
    }
  }, [currentUserRole]);

  // ── God-only guard ────────────────────────────────────────────────────────
  if (currentUserRole !== 'god') {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">
          Access Denied: Only the owner can manage employee accounts.
        </Alert>
      </Container>
    );
  }

  // ── Load employees ────────────────────────────────────────────────────────
  const loadEmployees = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'users'));
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      Swal.fire('Error', 'Failed to load employees: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Load pending invites (not yet accepted) ───────────────────────────────
  const loadPendingInvites = async () => {
    try {
      setInvitesLoading(true);
      const snap = await getDocs(collection(db, 'invites'));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Only show unused, non-expired invites
      const pending = all.filter(inv => !inv.used);
      pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setPendingInvites(pending);
    } catch (err) {
      console.error('Error loading invites:', err);
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleCancelInvite = async (invite) => {
    const result = await Swal.fire({
      title: 'Cancel Invite?',
      html: `Cancel the pending invite for <strong>${invite.name}</strong> (${invite.email})?<br/>They will not be able to use this link.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Cancel Invite',
      confirmButtonColor: '#d33',
      cancelButtonText: 'Keep It',
    });
    if (!result.isConfirmed) return;
    try {
      await updateDoc(doc(db, 'invites', invite.id), {
        used: true,
        cancelledAt: new Date().toISOString(),
        cancelledBy: currentUser.uid,
      });
      Swal.fire({ icon: 'success', title: 'Invite Cancelled', timer: 1500, showConfirmButton: false });
      loadPendingInvites();
    } catch (err) {
      Swal.fire('Error', 'Failed to cancel invite: ' + err.message, 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // INVITE FLOW (new preferred method)
  // ════════════════════════════════════════════════════════════════════════════
  const openInvite = () => {
    setInviteForm({
      name: '', email: '', role: 'crew', jobTitle: 'Crew Member',
      phoneNumber: '', employmentType: 'hourly', hourlyRate: '',
      annualSalary: '', paySchedule: 'semi-monthly', requireGps: true,
    });
    setInviteOpen(true);
  };

  const handleSendInvite = async () => {
    const { name, email, employmentType, hourlyRate, annualSalary } = inviteForm;
    if (!name.trim() || !email.trim()) {
      Swal.fire('Missing Fields', 'Name and email are required.', 'warning'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Swal.fire('Invalid Email', 'Please enter a valid email address.', 'warning'); return;
    }
    if (employmentType === 'hourly' && (!hourlyRate || parseFloat(hourlyRate) <= 0)) {
      Swal.fire('Missing Pay Rate', 'Please enter an hourly rate.', 'warning'); return;
    }
    if (employmentType === 'salary' && (!annualSalary || parseFloat(annualSalary) <= 0)) {
      Swal.fire('Missing Salary', 'Please enter an annual salary.', 'warning'); return;
    }
    try {
      setInviteLoading(true);
      const result = await sendEmployeeInviteFn({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: inviteForm.role,
        jobTitle: inviteForm.jobTitle,
        phoneNumber: inviteForm.phoneNumber.trim(),
        employmentType,
        hourlyRate: employmentType === 'hourly' ? parseFloat(hourlyRate) : 0,
        annualSalary: employmentType === 'salary' ? parseFloat(annualSalary) : 0,
        paySchedule: inviteForm.paySchedule,
        requireGps: inviteForm.requireGps,
        invitedBy: currentUser.uid,
      });
      setInviteOpen(false);
      loadPendingInvites();
      Swal.fire({
        icon: 'success',
        title: 'Invite Sent!',
        html: `
          <p>An invitation email has been sent to <strong>${email.trim()}</strong></p>
          <p style="color:#555;font-size:0.9em;">Link expires in 72 hours.<br/>
          They will sign the NDA on first login.</p>
        `,
      });
    } catch (err) {
      Swal.fire('Error', 'Failed to send invite: ' + err.message, 'error');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleResendInvite = async (emp) => {
    try {
      await sendEmployeeInviteFn({
        name: emp.name, email: emp.email, role: emp.role || 'crew',
        jobTitle: emp.jobTitle || 'Crew Member', phoneNumber: emp.phoneNumber || '',
        employmentType: emp.employmentType || 'hourly',
        hourlyRate: emp.hourlyRate || 0, annualSalary: emp.annualSalary || 0,
        paySchedule: emp.paySchedule || 'semi-monthly',
        requireGps: emp.requireGps !== false,
        invitedBy: currentUser.uid, resend: true,
      });
      Swal.fire({ icon: 'success', title: 'Invite Resent!', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire('Error', 'Failed to resend invite: ' + err.message, 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // LEGACY CREATE FLOW (kept as fallback — manual password)
  // ════════════════════════════════════════════════════════════════════════════
  const handleOpenDialog = (employee = null) => {
    if (employee) {
      setEditMode(true);
      setSelectedEmployee(employee);
      setFormData({
        name: employee.name || '',
        email: employee.email || '',
        password: '',
        role: employee.role || 'crew',
        jobTitle: employee.jobTitle || 'Crew Member',
        phoneNumber: employee.phoneNumber || '',
        hourlyRate: employee.hourlyRate || '',
        employmentType: employee.employmentType || (employee.role === 'crew' ? 'hourly' : 'salary'),
        annualSalary: employee.annualSalary || '',
        paySchedule: employee.paySchedule || 'semi-monthly',
        requireGps: employee.requireGps !== false,
      });
    } else {
      setEditMode(false);
      setSelectedEmployee(null);
      setFormData({
        name: '', email: '', password: '', role: 'crew',
        jobTitle: 'Crew Member', phoneNumber: '', hourlyRate: '',
        employmentType: 'hourly', annualSalary: '', paySchedule: 'semi-monthly',
        requireGps: true,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false); setEditMode(false); setSelectedEmployee(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateEmployee = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      Swal.fire('Error', 'Name, email, and password are required', 'error'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      Swal.fire('Error', 'Invalid email address', 'error'); return;
    }
    if (formData.password.length < 6) {
      Swal.fire('Error', 'Password must be at least 6 characters', 'error'); return;
    }

    const employeeData = { ...formData, name: formData.name.trim(), email: formData.email.trim() };
    const currentUserEmail = currentUser.email;
    handleCloseDialog();

    const { value: currentPassword } = await Swal.fire({
      title: 'Confirm Your Password',
      text: 'Enter YOUR password to create this account:',
      input: 'password', inputPlaceholder: 'Your password',
      showCancelButton: true, allowOutsideClick: false,
      inputValidator: v => !v ? 'Password required' : null,
    });
    if (!currentPassword) { setFormData(employeeData); setOpenDialog(true); return; }

    Swal.fire({ title: 'Creating Employee...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, employeeData.email, employeeData.password);
      const newUserId = userCredential.user.uid;

      await signInWithEmailAndPassword(auth, currentUserEmail, currentPassword);
      await new Promise(r => setTimeout(r, 500));

      await setDoc(doc(db, 'users', newUserId), {
        name: employeeData.name,
        email: employeeData.email,
        role: employeeData.role,
        jobTitle: employeeData.jobTitle,
        phoneNumber: employeeData.phoneNumber || '',
        employmentType: employeeData.employmentType || 'hourly',
        hourlyRate: employeeData.employmentType === 'hourly' ? parseFloat(employeeData.hourlyRate) || 0 : 0,
        annualSalary: employeeData.employmentType === 'salary' ? parseFloat(employeeData.annualSalary) || 0 : 0,
        paySchedule: employeeData.paySchedule || 'semi-monthly',
        requireGps: employeeData.requireGps !== false,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.uid,
        active: true, firstLogin: true,
        ndaSigned: false, ndaSignedDate: null, ndaSignatureUrl: null,
        startDate: new Date().toISOString(),
      });

      Swal.fire({
        icon: 'success', title: 'Employee Created!',
        html: `
          <p><strong>${employeeData.name}</strong> created!</p>
          <p><strong>Email:</strong> ${employeeData.email}</p>
          <p><strong>Pay Type:</strong> ${employeeData.employmentType === 'salary' ? 'Salary' : 'Hourly'}</p>
          <p><strong>Temporary Password:</strong> ${employeeData.password}</p>
          <p style="color:orange;">⚠️ Share this password with the employee.</p>
          <p style="color:blue;">📝 They will sign the NDA on first login.</p>
          <hr/>
          <p style="color:#555;font-size:0.9em;">💡 Tip: Use "Invite Employee" next time — they create their own password.</p>
        `,
        confirmButtonText: 'Got it!',
      });
      loadEmployees();
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use' ? 'Email already registered.'
        : err.code === 'auth/wrong-password' ? 'Incorrect password.'
        : err.message;
      Swal.fire('Error', msg, 'error');
    }
  };

  const handleUpdateEmployee = async () => {
    if (!selectedEmployee) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'users', selectedEmployee.id), {
        name: formData.name,
        role: formData.role,
        jobTitle: formData.jobTitle,
        phoneNumber: formData.phoneNumber || '',
        employmentType: formData.employmentType || 'hourly',
        hourlyRate: formData.employmentType === 'hourly' ? parseFloat(formData.hourlyRate) || 0 : 0,
        annualSalary: formData.employmentType === 'salary' ? parseFloat(formData.annualSalary) || 0 : 0,
        paySchedule: formData.paySchedule || 'semi-monthly',
        requireGps: formData.requireGps !== false,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.uid,
      });
      Swal.fire({ icon: 'success', title: 'Employee Updated!', timer: 1500, showConfirmButton: false });
      handleCloseDialog();
      loadEmployees();
    } catch (err) {
      Swal.fire('Error', 'Failed to update: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // TOGGLE ACTIVE / DELETE
  // ════════════════════════════════════════════════════════════════════════════
  const handleToggleActive = async (employee) => {
    const newStatus = employee.active === false ? true : false;
    const result = await Swal.fire({
      title: `${newStatus ? 'Enable' : 'Disable'} ${employee.name}?`,
      html: newStatus
        ? '<p>✅ They can clock in again</p><p>✅ They will appear in the time clock</p>'
        : '<p>❌ They will NOT be able to clock in</p><p>✅ Records are preserved</p>',
      icon: 'question', showCancelButton: true,
      confirmButtonText: newStatus ? 'Enable' : 'Disable',
    });
    if (!result.isConfirmed) return;
    await updateDoc(doc(db, 'users', employee.id), {
      active: newStatus,
      updatedAt: new Date().toISOString(),
      ...(newStatus ? {} : { inactivatedAt: new Date().toISOString() }),
    });
    Swal.fire({ icon: 'success', title: newStatus ? 'Enabled!' : 'Disabled!', timer: 1500, showConfirmButton: false });
    loadEmployees();
  };

  const handleDeleteEmployee = async (employee) => {
    try {
      const timeSnap = await getDocs(query(collection(db, 'job_time_entries'), where('crewEmail', '==', employee.email)));
      const paySnap  = await getDocs(query(collection(db, 'crew_payments'),     where('crewEmail', '==', employee.email)));
      const timeCount = timeSnap.size, payCount = paySnap.size;

      const result = await Swal.fire({
        title: 'Delete Employee?',
        html: `
          <p>Delete <strong>${employee.name}</strong>?</p>
          <div style="text-align:left;margin:15px 0;background:#fff3cd;padding:10px;border-radius:5px;">
            <p><strong>⚠️ Warning:</strong></p>
            <p>• <strong>${timeCount}</strong> time ${timeCount === 1 ? 'entry' : 'entries'} will be orphaned</p>
            <p>• <strong>${payCount}</strong> payment ${payCount === 1 ? 'record' : 'records'} will be orphaned</p>
            <p>• This cannot be undone!</p>
          </div>
          <div style="text-align:left;margin:15px 0;background:#d1ecf1;padding:10px;border-radius:5px;">
            <p><strong>💡 Better option: Mark Inactive instead</strong></p>
            <p>• Preserves all records for taxes</p>
            <p>• Prevents them from clocking in</p>
            <p>• Can be reactivated later</p>
          </div>
        `,
        icon: 'warning',
        showDenyButton: true, showCancelButton: true,
        confirmButtonText: '🗑️ Delete Anyway',
        denyButtonText: '🔒 Mark Inactive Instead',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#d32f2f',
        denyButtonColor: '#1976d2',
        width: '600px',
      });

      if (result.isConfirmed) {
        await deleteDoc(doc(db, 'users', employee.id));
        Swal.fire({
          icon: 'success', title: 'Deleted!',
          html: `<p>${employee.name} deleted.</p><p style="color:orange;">⚠️ ${timeCount + payCount} records are now orphaned.</p>`,
          timer: 4000,
        });
        loadEmployees();
      } else if (result.isDenied) {
        await updateDoc(doc(db, 'users', employee.id), {
          active: false, inactivatedAt: new Date().toISOString(), updatedBy: currentUser.uid,
        });
        Swal.fire({
          icon: 'success', title: 'Marked Inactive!',
          html: `<p><strong>${employee.name}</strong> can no longer clock in.</p><p>✅ All records preserved for taxes</p>`,
          timer: 3000,
        });
        loadEmployees();
      }
    } catch (err) {
      Swal.fire('Error', 'Failed: ' + err.message, 'error');
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // NDA VIEWER (preserved from original)
  // ════════════════════════════════════════════════════════════════════════════
  const handleViewNDA = (employee) => {
    if (!employee.ndaSigned) {
      Swal.fire('Info', 'This employee has not signed the NDA yet.', 'info'); return;
    }
    setViewingNDA(employee);
    setNdaViewerOpen(true);
  };

  const handleCloseNDAViewer = () => { setNdaViewerOpen(false); setViewingNDA(null); };

  const handleDownloadNDAPDF = async () => {
    if (!viewingNDA) return;
    try {
      setGeneratingPDF(true);
      const pdf = await generateEmployeeNDAPDF(viewingNDA, logoDataUrl);
      const fileName = `NDA_${viewingNDA.name.replace(/\s+/g, '_')}_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`;
      pdf.save(fileName);
      Swal.fire({ icon: 'success', title: 'PDF Downloaded!', text: `Saved as ${fileName}`, timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire('Error', 'Failed to generate PDF. Please try again.', 'error');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleViewSignature = () => {
    if (viewingNDA?.ndaSignatureUrl) window.open(viewingNDA.ndaSignatureUrl, '_blank');
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getRoleLabel = r => ({ god: 'Owner', admin: 'Admin', crew: 'Crew' }[r] || 'User');
  const getRoleBadgeColor = r => ({ god: 'error', admin: 'primary', crew: 'success' }[r] || 'default');

  const filteredEmployees = employees.filter(emp => {
    if (filter === 'active')   return emp.active !== false;
    if (filter === 'inactive') return emp.active === false;
    if (filter === 'pending')  return emp.firstLogin === true && emp.ndaSigned !== true;
    return true;
  });

  const stats = {
    total:   employees.length,
    active:  employees.filter(e => e.active !== false).length,
    ndaSigned: employees.filter(e => e.ndaSigned === true).length,
    pending: employees.filter(e => e.firstLogin === true && e.ndaSigned !== true).length,
  };

  // ── Employment fields — reused in both dialogs ────────────────────────────
  // EmploymentFields moved to top-level — see above component definition

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>

      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <PersonAddIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Box>
                <Typography variant="h5" fontWeight="bold">Employee Account Manager</Typography>
                <Typography variant="body2" color="text.secondary">
                  Invite employees by email — they set their own password and sign the NDA on first login
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                Add Manually
              </Button>
              <Button variant="contained" color="success" startIcon={<SendIcon />} onClick={openInvite}
                sx={{ bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } }}>
                Invite Employee
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Employees', value: stats.total,    color: 'text.primary' },
          { label: 'Active',          value: stats.active,   color: 'success.main' },
          { label: 'NDA Signed',      value: stats.ndaSigned,color: 'primary.main' },
          { label: 'Pending NDA',     value: stats.pending,  color: 'warning.main' },
        ].map(s => (
          <Grid item xs={6} sm={3} key={s.label}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography color="text.secondary" variant="body2">{s.label}</Typography>
                <Typography variant="h4" color={s.color} fontWeight="bold">{s.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Invite info banner */}
      <Alert severity="info" sx={{ mb: 2 }} icon={<EmailIcon />}>
        <strong>New: Invite System.</strong> Click "Invite Employee" to send a secure email link — no temp passwords, no re-authentication required.
        The employee creates their own password and signs the NDA automatically.
      </Alert>

      {/* Filter Buttons */}
      <Box sx={{ mb: 2 }}>
        <ButtonGroup variant="contained" size="large">
          {[
            { key: 'all',      label: `All (${stats.total})`,          color: 'primary' },
            { key: 'active',   label: `Active (${stats.active})`,      color: 'success' },
            { key: 'inactive', label: `Inactive (${employees.filter(e => e.active === false).length})`, color: 'warning' },
            { key: 'pending',  label: `Pending NDA (${stats.pending})`,color: 'warning' },
          ].map(f => (
            <Button key={f.key} color={filter === f.key ? f.color : 'inherit'} onClick={() => setFilter(f.key)}>
              {f.label}
            </Button>
          ))}
        </ButtonGroup>
      </Box>

      {/* Employee Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={60} />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                {['Name / Title', 'Email', 'Role', 'Pay Type', 'Rate', 'GPS', 'NDA Status', 'Status', 'Created', 'Actions'].map(h => (
                  <TableCell key={h}><strong>{h}</strong></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                      No employees found for this filter.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map(employee => {
                  const empType = employee.employmentType || (employee.role === 'crew' ? 'hourly' : 'salary');
                  const isPending = employee.firstLogin === true && employee.ndaSigned !== true;
                  return (
                    <TableRow key={employee.id} hover sx={{ opacity: employee.active === false ? 0.55 : 1 }}>
                      <TableCell>
                        <Typography fontWeight="bold">{employee.name || 'N/A'}</Typography>
                        <Chip label={employee.jobTitle || 'N/A'} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{employee.email || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip label={getRoleLabel(employee.role)} color={getRoleBadgeColor(employee.role)} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip label={empType === 'salary' ? 'Salary' : 'Hourly'} size="small"
                          color={empType === 'salary' ? 'info' : 'default'} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {empType === 'salary'
                          ? <Box>
                              <Typography variant="body2">${(employee.annualSalary || 0).toLocaleString()}/yr</Typography>
                              <Typography variant="caption" color="text.secondary">
                                ${calcPerPeriod(employee.annualSalary, employee.paySchedule)}/period
                              </Typography>
                            </Box>
                          : <Typography variant="body2">
                              {employee.hourlyRate ? `$${parseFloat(employee.hourlyRate).toFixed(2)}/hr` : 'N/A'}
                            </Typography>
                        }
                      </TableCell>
                      <TableCell>
                        {empType === 'hourly'
                          ? <Chip label={employee.requireGps !== false ? 'Required' : 'Skipped'} size="small"
                                  color={employee.requireGps !== false ? 'success' : 'default'} />
                          : <Typography variant="caption" color="text.secondary">N/A</Typography>
                        }
                      </TableCell>
                      <TableCell>
                        {employee.ndaSigned
                          ? <Chip icon={<CheckCircleIcon />} label="Signed" color="success" size="small"
                              onClick={() => handleViewNDA(employee)} sx={{ cursor: 'pointer' }} />
                          : isPending
                            ? <Chip icon={<PendingIcon />} label="Pending" color="warning" size="small" />
                            : <Chip label="Not Sent" size="small" />
                        }
                      </TableCell>
                      <TableCell>
                        <Chip label={employee.active !== false ? 'Active' : 'Disabled'}
                          color={employee.active !== false ? 'success' : 'default'} size="small" />
                      </TableCell>
                      <TableCell>
                        {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="primary" title="Edit" onClick={() => handleOpenDialog(employee)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        {isPending && (
                          <IconButton size="small" color="info" title="Resend Invite" onClick={() => handleResendInvite(employee)}>
                            <EmailIcon fontSize="small" />
                          </IconButton>
                        )}
                        <IconButton size="small"
                          color={employee.active !== false ? 'warning' : 'success'}
                          title={employee.active !== false ? 'Disable Account' : 'Enable Account'}
                          onClick={() => handleToggleActive(employee)}>
                          {employee.active !== false ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                        </IconButton>
                        {employee.id !== currentUser.uid && (
                          <IconButton size="small" color="error" title="Delete" onClick={() => handleDeleteEmployee(employee)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      )}

      {/* ── PENDING INVITES SECTION ────────────────────────────────────────── */}
      <Box sx={{ mt: 4, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SendIcon color="info" />
            Pending Invites
            {pendingInvites.length > 0 && (
              <Chip label={pendingInvites.length} color="info" size="small" />
            )}
          </Typography>
          <Button size="small" variant="outlined" onClick={loadPendingInvites}>
            Refresh
          </Button>
        </Box>
        <Alert severity="info" sx={{ mb: 2 }}>
          These employees have been sent an invite but have not yet created their account.
          The link expires 72 hours after sending.
        </Alert>

        {invitesLoading ? (
          <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={32} /></Box>
        ) : pendingInvites.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
            <Typography color="text.secondary">No pending invites. All sent invites have been accepted.</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'info.main' }}>
                  {['Name', 'Email', 'Role', 'Pay Type', 'Sent', 'Expires', 'Status', 'Actions'].map(h => (
                    <TableCell key={h} sx={{ color: 'white', fontWeight: 'bold' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingInvites.map(invite => {
                  const isExpired = new Date(invite.expiresAt) < new Date();
                  return (
                    <TableRow key={invite.id} sx={{ bgcolor: isExpired ? 'error.50' : 'white' }}>
                      <TableCell><Typography fontWeight="bold">{invite.name}</Typography></TableCell>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        <Chip label={invite.role || 'crew'} size="small"
                          color={invite.role === 'admin' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={invite.employmentType === 'salary' ? 'Salary' : 'Hourly'}
                          size="small" variant="outlined"
                          color={invite.employmentType === 'salary' ? 'info' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {invite.createdAt ? new Date(invite.createdAt).toLocaleDateString() : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={isExpired ? 'error' : 'text.secondary'}>
                          {isExpired ? 'EXPIRED' : invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={isExpired ? 'Expired' : 'Awaiting Signup'}
                          size="small"
                          color={isExpired ? 'error' : 'warning'}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" color="info"
                          startIcon={<EmailIcon />}
                          onClick={() => handleResendInvite(invite)}
                          sx={{ mr: 1 }}>
                          Resend
                        </Button>
                        <Button size="small" variant="outlined" color="error"
                          onClick={() => handleCancelInvite(invite)}>
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* ── INVITE DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'success.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SendIcon /><span>Invite New Employee</span>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            A secure email invitation will be sent. The employee creates their own password and signs the NDA on first login.
            No temporary passwords needed.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Full Name" value={inviteForm.name}
                onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Email Address" type="email" value={inviteForm.email}
                onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select fullWidth label="Role" value={inviteForm.role}
                onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}>
                <MenuItem value="crew">👷 Crew Member</MenuItem>
                <MenuItem value="admin">⚙️ Admin</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select fullWidth label="Job Title" value={inviteForm.jobTitle}
                onChange={e => setInviteForm({ ...inviteForm, jobTitle: e.target.value })}>
                <MenuItem value="Owner">👑 Owner</MenuItem>
                <MenuItem value="Manager">⚙️ Manager</MenuItem>
                <MenuItem value="Foreman">🔨 Foreman</MenuItem>
                <MenuItem value="Crew Member">👷 Crew Member</MenuItem>
                <MenuItem value="Equipment Operator">🚜 Equipment Operator</MenuItem>
                <MenuItem value="Landscaper">🌳 Landscaper</MenuItem>
                <MenuItem value="Office Manager">🏢 Office Manager</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Phone Number" value={inviteForm.phoneNumber}
                onChange={e => setInviteForm({ ...inviteForm, phoneNumber: e.target.value })} />
            </Grid>
            <EmploymentFields form={inviteForm} setForm={setInviteForm} />
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success"
            startIcon={inviteLoading ? <CircularProgress size={18} /> : <SendIcon />}
            onClick={handleSendInvite} disabled={inviteLoading}>
            {inviteLoading ? 'Sending...' : 'Send Invite'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── ADD / EDIT DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editMode ? '✏️ Edit Employee' : '➕ Add New Employee'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField fullWidth required label="Full Name *" name="name"
                value={formData.name} onChange={handleInputChange} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth required label="Email *" name="email" type="email"
                value={formData.email} onChange={handleInputChange} disabled={editMode} />
            </Grid>
            {!editMode && (
              <Grid item xs={12}>
                <TextField fullWidth required label="Password *" name="password" type="password"
                  value={formData.password} onChange={handleInputChange}
                  helperText="Minimum 6 characters. Consider using Invite Employee instead." />
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Role *</InputLabel>
                <Select name="role" value={formData.role} onChange={handleInputChange} label="Role *">
                  <MenuItem value="crew">👷 Crew - Time Clock only</MenuItem>
                  <MenuItem value="admin">⚙️ Admin - Most features</MenuItem>
                  <MenuItem value="god">👑 God - Full access</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Job Title *</InputLabel>
                <Select name="jobTitle" value={formData.jobTitle} onChange={handleInputChange} label="Job Title *">
                  <MenuItem value="Owner">👑 Owner</MenuItem>
                  <MenuItem value="Manager">⚙️ Manager</MenuItem>
                  <MenuItem value="Foreman">🔨 Foreman</MenuItem>
                  <MenuItem value="Crew Member">👷 Crew Member</MenuItem>
                  <MenuItem value="Equipment Operator">🚜 Equipment Operator</MenuItem>
                  <MenuItem value="Landscaper">🌳 Landscaper</MenuItem>
                  <MenuItem value="Office Manager">🏢 Office Manager</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Phone Number" name="phoneNumber"
                value={formData.phoneNumber} onChange={handleInputChange} />
            </Grid>
            <EmploymentFields
              form={formData}
              setForm={editMode
                ? (updated) => setFormData(updated)
                : (updated) => setFormData(updated)
              }
            />
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="inherit">Cancel</Button>
          <Button onClick={editMode ? handleUpdateEmployee : handleCreateEmployee}
            variant="contained" color="primary" disabled={loading}>
            {editMode ? 'Update Employee' : 'Create Employee'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── NDA VIEWER DIALOG (preserved from original) ────────────────────── */}
      <Dialog open={ndaViewerOpen} onClose={handleCloseNDAViewer} maxWidth="md" fullWidth>
        <DialogTitle>📋 NDA Signature — {viewingNDA?.name}</DialogTitle>
        <DialogContent>
          {viewingNDA && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Alert severity="success" icon={<CheckCircleIcon />}>
                  <strong>NDA Signed!</strong> This employee has completed and signed the Non-Disclosure Agreement.
                </Alert>
              </Grid>
              {[
                { label: 'Employee Name', value: viewingNDA.name },
                { label: 'Email',         value: viewingNDA.email },
                { label: 'Job Title',     value: viewingNDA.jobTitle },
                { label: 'Date Signed',   value: viewingNDA.ndaSignedDate ? new Date(viewingNDA.ndaSignedDate).toLocaleString() : 'N/A' },
              ].map(f => (
                <Grid item xs={12} sm={6} key={f.label}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>{f.label}</Typography>
                  <Typography variant="body1" fontWeight={f.label === 'Employee Name' ? 600 : 400}>{f.value}</Typography>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Digital Signature</Typography>
                <Paper elevation={2} sx={{ p: 2, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                  {viewingNDA.ndaSignatureUrl ? (
                    <Box sx={{ textAlign: 'center' }}>
                      <img src={viewingNDA.ndaSignatureUrl} alt="Signature"
                        style={{ maxWidth: '100%', maxHeight: 200, border: '2px solid #1976d2', borderRadius: 4, backgroundColor: 'white' }} />
                      <Button variant="outlined" size="small" onClick={handleViewSignature} sx={{ mt: 2 }}>
                        View Full Size
                      </Button>
                    </Box>
                  ) : (
                    <Typography color="text.secondary">No signature image available</Typography>
                  )}
                </Paper>
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info">
                  <strong>Complete NDA Document:</strong> Download the full signed NDA as a PDF with all terms and the employee's signature.
                </Alert>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNDAViewer} color="inherit">Close</Button>
          <Button onClick={handleDownloadNDAPDF} variant="contained" color="primary" disabled={generatingPDF}
            startIcon={generatingPDF ? <CircularProgress size={20} color="inherit" /> : null}>
            {generatingPDF ? 'Generating PDF...' : 'Download Full NDA PDF'}
          </Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
};

export default EmployeeAccountManager;