import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Grid,
  Paper,
  IconButton,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Close as CloseIcon,
  PhotoCamera as PhotoCameraIcon,
  AddCircle as AddCircleIcon,
  Delete as DeleteIcon,
  QrCode2 as QrCode2Icon,
  Phone as PhoneIcon,
} from '@mui/icons-material';
import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import QRCode from 'qrcode';
import Swal from 'sweetalert2';
import moment from 'moment';
import { generateSecureToken } from './utils/tokenUtils';

const ServiceClockOut = ({ 
  open, 
  onClose, 
  timeEntry, 
  jobType, // "WEED_EXTRACTION" or regular job
  onComplete 
}) => {
  // Customer management
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    address: '',
    phone: '',
    email: ''
  });

  // Service details (Weed Job)
  const [weedServices, setWeedServices] = useState({
    frontYard: false,
    backYard: false,
    otherExtraction: false
  });

  // Service details (Maintenance/Other Job)
  const [serviceDescription, setServiceDescription] = useState('');
  const [customAmount, setCustomAmount] = useState('');

  // Common fields
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const fileInputRef = useRef(null);

  // Payment
  const [paidOnSite, setPaidOnSite] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [zelleQR, setZelleQR] = useState('');
  const [showPaymentScreen, setShowPaymentScreen] = useState(false);

  const [loading, setLoading] = useState(false);

  const ZELLE_PHONE = '9284505733'; // Your Zelle number

  useEffect(() => {
    if (open) {
      loadCustomers();
      if (jobType !== 'WEED_EXTRACTION') {
        // Pre-fill description from time entry if available
        setServiceDescription(timeEntry?.jobName || '');
      }
    }
  }, [open, timeEntry, jobType]);

  const loadCustomers = async () => {
    try {
      const customersSnap = await getDocs(collection(db, 'customers'));
      const customersList = customersSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setCustomers(customersList);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const calculateTotal = () => {
    if (jobType === 'WEED_EXTRACTION') {
      let total = 0;
      if (weedServices.frontYard) total += 50;
      if (weedServices.backYard) total += 50;
      if (weedServices.otherExtraction) total += 75;
      return total;
    } else {
      return parseFloat(customAmount) || 0;
    }
  };

  const generateZelleQR = async (amount) => {
    try {
      const zelleData = `zelle://pay?to=${ZELLE_PHONE}&amount=${amount.toFixed(2)}&memo=Service%20Payment`;
      const qrDataUrl = await QRCode.toDataURL(zelleData, {
        width: 300,
        margin: 2,
      });
      setZelleQR(qrDataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const handlePhotoCapture = (e) => {
    const files = Array.from(e.target.files);
    const newPhotos = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      timestamp: new Date().toISOString()
    }));
    setPhotos([...photos, ...newPhotos]);
  };

  const removePhoto = (index) => {
    const newPhotos = [...photos];
    URL.revokeObjectURL(newPhotos[index].preview);
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.address || !newCustomer.phone) {
      Swal.fire('Error', 'Please fill in Name, Address, and Phone', 'error');
      return;
    }

    try {
      const customerData = {
        name: newCustomer.name,
        address: newCustomer.address,
        phone: newCustomer.phone,
        email: newCustomer.email || '',
        createdAt: new Date().toISOString(),
        createdBy: timeEntry.crewId,
        source: 'field_service'
      };

      const docRef = await addDoc(collection(db, 'customers'), customerData);
      
      setSelectedCustomer(docRef.id);
      setCustomers([...customers, { id: docRef.id, ...customerData }]);
      setShowNewCustomer(false);
      setNewCustomer({ name: '', address: '', phone: '', email: '' });
      
      Swal.fire('Success!', 'Customer added', 'success');
    } catch (error) {
      console.error('Error adding customer:', error);
      Swal.fire('Error', 'Failed to add customer', 'error');
    }
  };

  const uploadPhotosToStorage = async () => {
    // For now, we'll store photos as base64 in Firestore
    // In production, you'd want to upload to Firebase Storage
    const photoData = await Promise.all(
      photos.map(async (photo) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              data: reader.result,
              timestamp: photo.timestamp
            });
          };
          reader.readAsDataURL(photo.file);
        });
      })
    );
    return photoData;
  };

  const handlePaymentClick = () => {
    const total = calculateTotal();
    if (total <= 0) {
      Swal.fire('Error', 'Please select services or enter an amount', 'error');
      return;
    }
    generateZelleQR(total);
    setShowPaymentScreen(true);
  };

  const handleSubmit = async () => {
    // Validation
    if (!selectedCustomer && !showNewCustomer) {
      Swal.fire('Error', 'Please select or add a customer', 'error');
      return;
    }

    const total = calculateTotal();
    if (total <= 0) {
      Swal.fire('Error', 'Please select services or enter an amount', 'error');
      return;
    }

    if (paidOnSite && !paymentMethod) {
      Swal.fire('Error', 'Please select payment method', 'error');
      return;
    }

    try {
      setLoading(true);
      console.log('🔵 Starting service completion...');
      console.log('Selected customer ID:', selectedCustomer);
      console.log('Available customers:', customers);

      // Get customer data
      const customer = customers.find(c => c.id === selectedCustomer);
      console.log('Found customer:', customer);
      
      if (!customer) {
        setLoading(false);
        Swal.fire('Error', 'Customer not found. Please select a valid customer.', 'error');
        return;
      }

      console.log('🔵 Uploading photos...');
      // Upload photos
      const photoData = await uploadPhotosToStorage();
      console.log('Photos uploaded:', photoData.length);

      console.log('🔵 Creating invoice...');
      // Create invoice line items
      let lineItems = [];
      let invoiceDescription = '';

      if (jobType === 'WEED_EXTRACTION') {
        if (weedServices.frontYard) {
          lineItems.push({ description: 'Front Yard Weed Extraction', amount: 50 });
        }
        if (weedServices.backYard) {
          lineItems.push({ description: 'Back Yard Weed Extraction', amount: 50 });
        }
        if (weedServices.otherExtraction) {
          lineItems.push({ description: 'Other Area Weed Extraction', amount: 75 });
        }
        invoiceDescription = 'Weed Extraction Service';
      } else {
        lineItems.push({ 
          description: serviceDescription || timeEntry.jobName, 
          amount: parseFloat(customAmount) 
        });
        invoiceDescription = serviceDescription || timeEntry.jobName;
      }

      // Create invoice
      const invoiceData = {
        customerId: selectedCustomer,
        clientName: customer.name,  // Changed from customerName to clientName
        customerName: customer.name,  // Keep both for compatibility
        customerAddress: customer.address,
        customerPhone: customer.phone,
        customerEmail: customer.email || '',
        description: invoiceDescription,
        lineItems: lineItems,
        subtotal: total,
        total: total,
        status: paidOnSite ? 'Paid' : 'Unpaid',
        notes: notes,
        photos: photoData,
        createdBy: timeEntry.crewId,
        createdByName: timeEntry.crewName,
        serviceDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        jobType: jobType,
        timeEntryId: timeEntry.id,
        paymentToken: generateSecureToken(),
      };

      console.log('🔵 Creating invoice in Firestore...');
      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);
      console.log('✅ Invoice created:', invoiceRef.id);

      // If paid on site, create payment record
      if (paidOnSite) {
        console.log('🔵 Creating payment record...');
        const paymentData = {
          invoiceId: invoiceRef.id,
          customerId: selectedCustomer,
          clientName: customer.name,
          customerName: customer.name,
          amount: total,
          paymentMethod: paymentMethod,
          paymentDate: new Date().toISOString(),
          collectedBy: timeEntry.crewId,
          collectedByName: timeEntry.crewName,
          notes: `Collected on-site via ${paymentMethod}`,
          status: 'completed',
          createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'payments'), paymentData);
        console.log('✅ Payment record created');

        // Update invoice with payment info
        await updateDoc(doc(db, 'invoices', invoiceRef.id), {
          paymentId: invoiceRef.id,
          paidAt: new Date().toISOString(),
          paidAmount: total
        });
        console.log('✅ Invoice updated with payment');
      }

      console.log('🔵 Clocking out employee...');
      // Clock out the employee
      const clockOutTime = new Date().toISOString();
      const clockInTime = moment(timeEntry.clockIn);
      const clockOutMoment = moment(clockOutTime);
      const hoursWorked = clockOutMoment.diff(clockInTime, 'hours', true);

      await updateDoc(doc(db, 'job_time_entries', timeEntry.id), {
        clockOut: clockOutTime,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        status: paidOnSite ? 'approved' : 'pending',
        invoiceId: invoiceRef.id,
        customerId: selectedCustomer,
        clientName: customer.name,
        customerName: customer.name,
        jobDescription: invoiceDescription,
        jobName: invoiceDescription,
        serviceTotal: total,
        paidOnSite: paidOnSite,
        completedAt: clockOutTime
      });
      console.log('✅ Time entry updated with clock-out');

      console.log('🎉 All operations complete! Closing modal and showing success...');
      
      // Close modal immediately (don't wait for Swal)
      onComplete();
      handleClose();
      
      // Show success message (fire and forget - don't chain anything)
      try {
        Swal.fire({
          icon: 'success',
          title: paidOnSite ? 'Service Complete & Paid!' : 'Service Complete!',
          html: `
            <p><strong>Customer:</strong> ${customer.name}</p>
            <p><strong>Total:</strong> $${total.toFixed(2)}</p>
            <p><strong>Hours Worked:</strong> ${hoursWorked.toFixed(2)}</p>
            ${paidOnSite ? `<p><strong>Payment:</strong> ${paymentMethod}</p>` : '<p>Invoice created - payment pending</p>'}
          `,
          confirmButtonText: 'Done',
          timer: 5000
        });
      } catch (err) {
        console.log('Swal display error (non-critical):', err);
      }

      console.log('✅ Modal closed successfully');


    } catch (error) {
      console.error('❌ ERROR completing service:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setLoading(false);
      Swal.fire({
        icon: 'error',
        title: 'Failed to Complete Service',
        html: `
          <p><strong>Error:</strong> ${error.message}</p>
          <p style="font-size: 0.9em; color: #666;">Check console for details</p>
        `,
        confirmButtonText: 'OK'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset all state
    setSelectedCustomer('');
    setShowNewCustomer(false);
    setNewCustomer({ name: '', address: '', phone: '', email: '' });
    setWeedServices({ frontYard: false, backYard: false, otherExtraction: false });
    setServiceDescription('');
    setCustomAmount('');
    setNotes('');
    setPhotos([]);
    setPaidOnSite(false);
    setPaymentMethod('');
    setShowPaymentScreen(false);
    onClose();
  };

  if (!open) return null;

  const total = calculateTotal();

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      fullScreen={window.innerWidth < 600}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {jobType === 'WEED_EXTRACTION' ? 'Weed Service Details' : 'Service Details'}
          </Typography>
          <IconButton onClick={handleClose} disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Customer Selection */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Customer
          </Typography>
          
          {!showNewCustomer ? (
            <Box>
              <TextField
                select
                fullWidth
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label="Select Customer"
                sx={{ mb: 1 }}
              >
                <MenuItem value="">-- Select Customer --</MenuItem>
                {customers.map(customer => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name} - {customer.address}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                startIcon={<AddCircleIcon />}
                onClick={() => setShowNewCustomer(true)}
                size="small"
              >
                Add New Customer
              </Button>
            </Box>
          ) : (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Name *"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Phone *"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Address *"
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({...newCustomer, address: e.target.value})}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Email (optional)"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button variant="contained" onClick={handleAddCustomer}>
                  Save Customer
                </Button>
                <Button variant="outlined" onClick={() => setShowNewCustomer(false)}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </Paper>

        {/* Service Details */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Service Details
          </Typography>

          {jobType === 'WEED_EXTRACTION' ? (
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={weedServices.frontYard}
                    onChange={(e) => setWeedServices({...weedServices, frontYard: e.target.checked})}
                  />
                }
                label="Front Yard - $50"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={weedServices.backYard}
                    onChange={(e) => setWeedServices({...weedServices, backYard: e.target.checked})}
                  />
                }
                label="Back Yard - $50"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={weedServices.otherExtraction}
                    onChange={(e) => setWeedServices({...weedServices, otherExtraction: e.target.checked})}
                  />
                }
                label="Other Extraction - $75"
              />
            </Box>
          ) : (
            <Box>
              <TextField
                fullWidth
                label="Service Description"
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                InputProps={{
                  startAdornment: <Typography>$</Typography>
                }}
              />
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe work completed, conditions found, recommendations..."
          />
        </Paper>

        {/* Photos */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Photos
          </Typography>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handlePhotoCapture}
          />

          <Button
            variant="outlined"
            startIcon={<PhotoCameraIcon />}
            onClick={() => fileInputRef.current.click()}
            sx={{ mb: 2 }}
          >
            Add Photos
          </Button>

          <Grid container spacing={1}>
            {photos.map((photo, index) => (
              <Grid item xs={6} sm={4} key={index}>
                <Box sx={{ position: 'relative' }}>
                  <img
                    src={photo.preview}
                    alt={`Service ${index + 1}`}
                    style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 4 }}
                  />
                  <IconButton
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      bgcolor: 'rgba(255,255,255,0.8)'
                    }}
                    onClick={() => removePhoto(index)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Paper>

        {/* Payment */}
        {!showPaymentScreen ? (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Payment
            </Typography>

            <Box sx={{ bgcolor: '#e3f2fd', p: 2, borderRadius: 1, mb: 2 }}>
              <Typography variant="h5" color="primary">
                Total: ${total.toFixed(2)}
              </Typography>
            </Box>

            <FormControlLabel
              control={
                <Checkbox
                  checked={paidOnSite}
                  onChange={(e) => setPaidOnSite(e.target.checked)}
                />
              }
              label="Customer paid on-site"
            />

            {paidOnSite && (
              <Box sx={{ mt: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Payment Method</InputLabel>
                  <Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    label="Payment Method"
                  >
                    <MenuItem value="Cash">Cash</MenuItem>
                    <MenuItem value="Check">Check</MenuItem>
                    <MenuItem value="Zelle">Zelle</MenuItem>
                    <MenuItem value="Card">Card</MenuItem>
                  </Select>
                </FormControl>

                {paymentMethod === 'Zelle' && (
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<QrCode2Icon />}
                    onClick={handlePaymentClick}
                    sx={{ mt: 2 }}
                  >
                    Show Zelle QR Code
                  </Button>
                )}
              </Box>
            )}
          </Paper>
        ) : (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Collect Payment
            </Typography>
            
            <Box sx={{ bgcolor: '#e8f5e9', p: 3, borderRadius: 2, mb: 2 }}>
              <Typography variant="h4" color="success.main" gutterBottom>
                ${total.toFixed(2)}
              </Typography>
              
              {zelleQR && (
                <Box sx={{ my: 2 }}>
                  <img src={zelleQR} alt="Zelle QR Code" style={{ maxWidth: 250 }} />
                </Box>
              )}

              <Typography variant="body1" gutterBottom>
                Scan to pay instantly
              </Typography>
              <Divider sx={{ my: 2 }}>OR</Divider>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <PhoneIcon />
                <Typography variant="h6">
                  928-450-5733
                </Typography>
              </Box>
            </Box>

            <Button
              variant="outlined"
              onClick={() => setShowPaymentScreen(false)}
              fullWidth
            >
              Back to Payment Options
            </Button>
          </Paper>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || !selectedCustomer || total <= 0}
        >
          {loading ? <CircularProgress size={24} /> : 'Complete Service'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ServiceClockOut;