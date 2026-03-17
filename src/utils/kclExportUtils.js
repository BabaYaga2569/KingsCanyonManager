import * as XLSX from 'xlsx';
import moment from 'moment';

// ── Generic helpers ──────────────────────────────────────────────

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h] == null ? '' : String(row[h]);
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadExcel(rows, sheetName, filename) {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

const today = () => moment().format('YYYY-MM-DD');

// ── CUSTOMERS ────────────────────────────────────────────────────

function mapCustomers(customers) {
  return customers.map(c => ({
    'Name': c.name || '',
    'Phone': c.phone || '',
    'Email': c.email || '',
    'Address': c.address || '',
    'City': c.city || '',
    'State': c.state || '',
    'ZIP': c.zip || '',
    'Lifetime Value': c.lifetimeValue || 0,
    'Total Jobs': c.jobCount || 0,
    'Total Bids': c.bidCount || 0,
    'Notes': c.notes || '',
    'Created Date': c.createdAt ? moment(c.createdAt).format('MM/DD/YYYY') : '',
  }));
}

export function exportCustomersToExcel(customers) {
  downloadExcel(mapCustomers(customers), 'Customers', `KCL_Customers_${today()}.xlsx`);
}

export function exportCustomersToCSV(customers) {
  downloadCSV(mapCustomers(customers), `KCL_Customers_${today()}.csv`);
}

// ── INVOICES ─────────────────────────────────────────────────────

function mapInvoices(invoices) {
  return invoices.map(inv => ({
    'Invoice #': inv.invoiceNumber || inv.id?.slice(0, 8) || '',
    'Customer': inv.customerName || '',
    'Amount': parseFloat(inv.total || inv.amount || 0).toFixed(2),
    'Paid': parseFloat(inv._totalPaid || 0).toFixed(2),
    'Balance': parseFloat(inv._remainingBalance ?? (inv.total || inv.amount || 0)).toFixed(2),
    'Status': inv.status || '',
    'Invoice Date': inv.invoiceDate
      ? moment(inv.invoiceDate?.toDate ? inv.invoiceDate.toDate() : inv.invoiceDate).format('MM/DD/YYYY')
      : inv.createdAt ? moment(inv.createdAt?.seconds ? inv.createdAt.seconds * 1000 : inv.createdAt).format('MM/DD/YYYY') : '',
    'Description': inv.description || '',
    'Notes': inv.notes || '',
  }));
}

export function exportInvoicesToExcel(invoices) {
  downloadExcel(mapInvoices(invoices), 'Invoices', `KCL_Invoices_${today()}.xlsx`);
}

export function exportInvoicesToCSV(invoices) {
  downloadCSV(mapInvoices(invoices), `KCL_Invoices_${today()}.csv`);
}

// ── PAYMENTS ─────────────────────────────────────────────────────

function mapPayments(payments) {
  return payments.map(p => ({
    'Date': p.date ? moment(p.date?.toDate ? p.date.toDate() : p.date).format('MM/DD/YYYY') : '',
    'Customer': p.customerName || '',
    'Amount': parseFloat(p.amount || 0).toFixed(2),
    'Method': p.method || p.paymentMethod || '',
    'Invoice #': p.invoiceNumber || p.invoiceId || '',
    'Job': p.jobName || '',
    'Notes': p.notes || '',
    'Recorded By': p.recordedBy || '',
  }));
}

export function exportPaymentsToExcel(payments) {
  downloadExcel(mapPayments(payments), 'Payments', `KCL_Payments_${today()}.xlsx`);
}

export function exportPaymentsToCSV(payments) {
  downloadCSV(mapPayments(payments), `KCL_Payments_${today()}.csv`);
}

// ── EXPENSES ─────────────────────────────────────────────────────

function mapExpenses(expenses) {
  return expenses.map(e => ({
    'Date': e.date ? moment(e.date).format('MM/DD/YYYY') : '',
    'Vendor': e.vendor || '',
    'Description': e.description || '',
    'Category': e.category || '',
    'Amount': parseFloat(e.amount || 0).toFixed(2),
    'Job': e.jobName || e.jobId || '',
    'Receipt': e.receiptUrl ? 'Yes' : 'No',
    'Notes': e.notes || '',
  }));
}

export function exportExpensesToExcel(expenses) {
  downloadExcel(mapExpenses(expenses), 'Expenses', `KCL_Expenses_${today()}.xlsx`);
}

export function exportExpensesToCSV(expenses) {
  downloadCSV(mapExpenses(expenses), `KCL_Expenses_${today()}.csv`);
}

// ── JOBS ─────────────────────────────────────────────────────────

function mapJobs(jobs) {
  return jobs.map(j => ({
    'Client': j.clientName || '',
    'Description': j.description || '',
    'Job Type': j.jobType || '',
    'Status': j.status || '',
    'Amount': parseFloat(j.amount || 0).toFixed(2),
    'Start Date': j.startDate ? moment(j.startDate?.toDate ? j.startDate.toDate() : j.startDate).format('MM/DD/YYYY') : '',
    'Created Date': j.createdAt
      ? moment(j.createdAt?.toDate ? j.createdAt.toDate() : j.createdAt).format('MM/DD/YYYY')
      : '',
    'Notes': j.notes || '',
  }));
}

export function exportJobsToExcel(jobs) {
  downloadExcel(mapJobs(jobs), 'Jobs', `KCL_Jobs_${today()}.xlsx`);
}

export function exportJobsToCSV(jobs) {
  downloadCSV(mapJobs(jobs), `KCL_Jobs_${today()}.csv`);
}

// ── APPROVE TIME / TIME ENTRIES ───────────────────────────────────

function mapTimeEntries(entries) {
  return entries.map(e => ({
    'Employee': e.crewName || '',
    'Job': e.jobName || e.jobId || '',
    'Clock In': e.clockIn ? moment(e.clockIn).format('MM/DD/YYYY h:mm A') : '',
    'Clock Out': e.clockOut ? moment(e.clockOut).format('MM/DD/YYYY h:mm A') : 'Still Clocked In',
    'Hours': parseFloat(e.hoursWorked || 0).toFixed(2),
    'Hourly Rate': parseFloat(e.hourlyRate || 0).toFixed(2),
    'Total Pay': (parseFloat(e.hoursWorked || 0) * parseFloat(e.hourlyRate || 0)).toFixed(2),
    'Status': e.status || '',
    'GPS Distance (ft)': e.gpsDistanceFeet || '',
    'Notes': e.notes || '',
  }));
}

export function exportTimeEntriesToExcel(entries) {
  downloadExcel(mapTimeEntries(entries), 'Time Entries', `KCL_TimeEntries_${today()}.xlsx`);
}

export function exportTimeEntriesToCSV(entries) {
  downloadCSV(mapTimeEntries(entries), `KCL_TimeEntries_${today()}.csv`);
}

// ── CREW PAYMENTS ─────────────────────────────────────────────────

function mapCrewPayments(payments) {
  return payments.map(p => ({
    'Date': p.date ? moment(p.date?.toDate ? p.date.toDate() : p.date).format('MM/DD/YYYY') : '',
    'Employee': p.crewName || '',
    'Job': p.jobName || '',
    'Hours': parseFloat(p.hoursWorked || 0).toFixed(2),
    'Hourly Rate': parseFloat(p.hourlyRate || 0).toFixed(2),
    'Amount Paid': parseFloat(p.amount || 0).toFixed(2),
    'Payment Method': p.paymentMethod || '',
    'Notes': p.notes || '',
  }));
}

export function exportCrewPaymentsToExcel(payments) {
  downloadExcel(mapCrewPayments(payments), 'Crew Payments', `KCL_CrewPayments_${today()}.xlsx`);
}

export function exportCrewPaymentsToCSV(payments) {
  downloadCSV(mapCrewPayments(payments), `KCL_CrewPayments_${today()}.csv`);
}