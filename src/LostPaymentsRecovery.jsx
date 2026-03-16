import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { 
  Box, Button, Paper, Typography, Alert, TextField, 
  Select, MenuItem, FormControl, InputLabel, Card, CardContent
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';

/**
 * LostPaymentsRecovery - Manually recreate the lost payments from Jan 19
 * 
 * This tool lets you manually add payment records for the cash collected
 * when customer names weren't recorded
 */

function LostPaymentsRecovery() {
  const [customers, setCustomers] = useState([]);
  const [newPayment, setNewPayment] = useState({
    customerId: '',
    amount: '',
    paymentDate: '2026-01-19',
    paymentMethod: 'cash',
    notes: ''
  });
  const [savedPayments, setSavedPayments] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const customersSnap = await getDocs(collection(db, 'customers'));
      const customersList = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomers(customersList.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (err) {
      setError('Error loading customers: ' + err.message);
    }
  };

  const handleSavePayment = async () => {
    // Validation
    if (!newPayment.customerId) {
      setError('Please select a customer');
      return;
    }
    if (!newPayment.amount || parseFloat(newPayment.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (!newPayment.paymentDate) {
      setError('Please enter a payment date');
      return;
    }

    try {
      setError(null);
      
      const customer = customers.find(c => c.id === newPayment.customerId);
      
      const paymentData = {
        customerId: newPayment.customerId,
        clientName: customer.name,
        amount: parseFloat(newPayment.amount),
        paymentMethod: newPayment.paymentMethod,
        paymentDate: newPayment.paymentDate,
        reference: 'Recovered lost payment',
        notes: `Manually recovered payment - ${newPayment.notes || 'Cash collected on-site'}`,
        receiptGenerated: false,
        createdAt: new Date().toISOString(),
        invoiceId: '', // No invoice linked
      };
      
      await addDoc(collection(db, 'payments'), paymentData);
      
      // Add to saved list
      setSavedPayments([...savedPayments, {
        customerName: customer.name,
        amount: paymentData.amount,
        date: paymentData.paymentDate
      }]);
      
      // Reset form
      setNewPayment({
        customerId: '',
        amount: '',
        paymentDate: newPayment.paymentDate, // Keep same date
        paymentMethod: 'cash',
        notes: ''
      });
      
      console.log(`✅ Payment saved: ${customer.name} - $${paymentData.amount}`);
      
    } catch (err) {
      setError('Error saving payment: ' + err.message);
      console.error('Error:', err);
    }
  };

  const suggestedAmounts = [100, 175, 50];

  return (
    <Paper sx={{ p: 3, mb: 3, bgcolor: 'warning.light' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <AddIcon sx={{ mr: 1, fontSize: 30 }} />
        <Typography variant="h5" fontWeight="bold">
          💰 Lost Payments Recovery
        </Typography>
      </Box>

      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight="bold">
          Use this tool to manually recreate the payments collected on Jan 19
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          ⚠️ Your crew collected cash but didn't record customer names
          <br />
          ✅ Use this to add the correct customer names to those payments
          <br />
          💡 Ask your crew who the customers were that day
        </Typography>
      </Alert>

      {/* Add New Payment Form */}
      <Card sx={{ mb: 3, bgcolor: 'background.paper' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Add Recovered Payment:
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Customer Select */}
            <FormControl fullWidth required>
              <InputLabel>Customer *</InputLabel>
              <Select
                value={newPayment.customerId}
                label="Customer *"
                onChange={(e) => setNewPayment({ ...newPayment, customerId: e.target.value })}
              >
                <MenuItem value="">-- Select Customer --</MenuItem>
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Amount */}
            <Box>
              <TextField
                label="Amount *"
                type="number"
                value={newPayment.amount}
                onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                fullWidth
                required
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Typography variant="caption" sx={{ mt: 1, mr: 1 }}>Quick:</Typography>
                {suggestedAmounts.map(amt => (
                  <Button
                    key={amt}
                    size="small"
                    variant="outlined"
                    onClick={() => setNewPayment({ ...newPayment, amount: amt.toString() })}
                  >
                    ${amt}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* Date */}
            <TextField
              label="Payment Date *"
              type="date"
              value={newPayment.paymentDate}
              onChange={(e) => setNewPayment({ ...newPayment, paymentDate: e.target.value })}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />

            {/* Payment Method */}
            <FormControl fullWidth>
              <InputLabel>Payment Method</InputLabel>
              <Select
                value={newPayment.paymentMethod}
                label="Payment Method"
                onChange={(e) => setNewPayment({ ...newPayment, paymentMethod: e.target.value })}
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="zelle">Zelle</MenuItem>
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>

            {/* Notes */}
            <TextField
              label="Notes (Optional)"
              value={newPayment.notes}
              onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder="e.g., Front and back yard weed spraying"
            />

            {error && (
              <Alert severity="error">{error}</Alert>
            )}

            <Button
              variant="contained"
              color="success"
              size="large"
              startIcon={<SaveIcon />}
              onClick={handleSavePayment}
              disabled={!newPayment.customerId || !newPayment.amount}
            >
              Save Payment
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Saved Payments List */}
      {savedPayments.length > 0 && (
        <Card sx={{ bgcolor: 'success.light' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              ✅ Recovered Payments ({savedPayments.length}):
            </Typography>
            {savedPayments.map((pmt, idx) => (
              <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                ✅ {pmt.customerName} - ${pmt.amount.toFixed(2)} ({pmt.date})
              </Typography>
            ))}
            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold">
                🎯 These payments are now in your Payments Dashboard!
              </Typography>
              <Typography variant="body2">
                Go to Payments Dashboard and refresh to see them.
              </Typography>
            </Alert>
          </CardContent>
        </Card>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2" fontWeight="bold">
          💡 Tips for recovering lost payments:
        </Typography>
        <Typography variant="body2">
          1. Ask your crew who they serviced on Jan 19, 2026
          <br />
          2. Check your calendar/schedule for that day
          <br />
          3. Look at common services (Front/Back yard = $100)
          <br />
          4. Add each payment one by one as you identify customers
          <br />
          5. When done, remove this component from Dashboard
        </Typography>
      </Alert>
    </Paper>
  );
}

export default LostPaymentsRecovery;