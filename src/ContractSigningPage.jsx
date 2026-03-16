import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getTokenFromUrl } from './utils/tokenUtils';
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import SignatureCanvas from "react-signature-canvas";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Swal from "sweetalert2";

// Create a simple theme for public pages
const publicTheme = createTheme({
  palette: {
    primary: {
      main: '#1565c0',
    },
    success: {
      main: '#2e7d32',
    },
  },
});

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  owner: "Darren Bennett",
  title: "Owner",
  phone: "(928) 450-5733",
  email: "kingscanyon775@gmail.com",
  logoPath: "/logo-kcl.png",
};

// This is a PUBLIC page - customers access without logging in
// It should NOT show navigation or allow access to other parts of the app
function ContractSigningPageContent() {
  const { contractId } = useParams();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  
  const sigPadRef = useRef(null);

  useEffect(() => {
    loadContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const loadContract = async () => {
    try {
      // Get token from URL
      const token = getTokenFromUrl();
      
      const docRef = doc(db, "contracts", contractId);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        Swal.fire("Not Found", "This contract link is invalid or expired.", "error");
        setLoading(false);
        return;
      }

      const data = snap.data();
      
      // Verify token matches (Firestore rules will also check this)
      if (data.signingToken && data.signingToken !== token) {
        Swal.fire("Access Denied", "Invalid or expired link. Please request a new signing link.", "error");
        setLoading(false);
        return;
      }
      
      setContract(data);
      
      // Check if already signed by client
      if (data.clientSignature && data.clientSignedAt) {
        setAlreadySigned(true);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error loading contract:", error);
      Swal.fire("Error", "Failed to load contract. Please try again.", "error");
      setLoading(false);
    }
  };

  const handleClearSignature = () => {
    sigPadRef.current?.clear();
  };

  const handleSign = async () => {
    if (!agreed) {
      Swal.fire("Agreement Required", "Please check the box to agree to the terms.", "warning");
      return;
    }

    if (sigPadRef.current?.isEmpty()) {
      Swal.fire("Signature Required", "Please sign in the box above.", "warning");
      return;
    }

    setSigning(true);

    try {
      const signatureData = sigPadRef.current.toDataURL();
      const timestamp = new Date().toISOString();
      
      // Auto-generate Darren's signature
      const darrenSig = generateDarrenSignature();

      await updateDoc(doc(db, "contracts", contractId), {
        clientSignature: signatureData,
        clientSignedAt: timestamp,
        contractorSignature: darrenSig,
        contractorSignedAt: timestamp,
        status: "Fully Signed", // Both signatures applied automatically
        lastUpdated: timestamp,
      });

      console.log("Contract signed by client:", contractId);

      // Phase 3: Notify admins via text
      try {
        const functions = getFunctions();
        const notifySignature = httpsCallable(functions, 'notifySignature');
        await notifySignature({
          docType: 'contract',
          docId: contractId,
          customerName: contract.clientName,
          amount: contract.amount,
        });
        console.log("Admin notification sent for contract signing");
      } catch (notifyError) {
        console.error("Admin notification failed (non-blocking):", notifyError);
      }

      Swal.fire({
        icon: "success",
        title: "Contract Signed!",
        html: `
          <p>Thank you for signing the contract!</p>
          <p><strong>Next Steps:</strong></p>
          <ul style="text-align: left;">
            <li>You'll receive a payment link via email</li>
            <li>Deposit amount: <strong>$${(contract.depositAmount || contract.amount * 0.5).toFixed(2)}</strong></li>
            <li>We'll start work once deposit is received</li>
          </ul>
          <p>Questions? Call us at ${COMPANY.phone}</p>
        `,
        confirmButtonText: "Close",
      });

      setAlreadySigned(true);
    } catch (error) {
      console.error("Error saving signature:", error);
      Swal.fire("Error", "Failed to save signature. Please try again.", "error");
    } finally {
      setSigning(false);
    }
  };

  // Generate Darren's auto-signature
  const generateDarrenSignature = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 100);
    
    // Signature text in cursive style
    ctx.font = '32px "Brush Script MT", cursive';
    ctx.fillStyle = 'black';
    ctx.fillText('Darren Bennett', 50, 60);
    
    return canvas.toDataURL('image/png');
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading contract...
        </Typography>
      </Container>
    );
  }

  if (!contract) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">
          <Typography variant="h6">Contract Not Found</Typography>
          <Typography>This contract link is invalid or has expired.</Typography>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      {/* Company Header */}
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <img 
          src={COMPANY.logoPath} 
          alt="Kings Canyon Landscaping" 
          style={{ width: 80, height: 80, marginBottom: 8 }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <Typography variant="h5" fontWeight="bold">
          {COMPANY.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {COMPANY.phone} | {COMPANY.email}
        </Typography>
      </Box>

      {/* Already Signed State */}
      {alreadySigned && (
        <Alert 
          severity="success" 
          icon={<CheckCircleIcon fontSize="large" />}
          sx={{ mb: 3, py: 2 }}
        >
          <Typography variant="h6">Contract Already Signed</Typography>
          <Typography>
            This contract was signed on {contract.clientSignedAt ? new Date(contract.clientSignedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'a previous date'}.
            You're all set — no further action needed.
          </Typography>
        </Alert>
      )}

      {/* Contract Details */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Service Contract
        </Typography>
        
        <Divider sx={{ mb: 2 }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">Client</Typography>
          <Typography variant="body1" fontWeight="bold">{contract.clientName}</Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">Amount</Typography>
          <Typography variant="h5" color="primary" fontWeight="bold">
            ${(contract.amount || 0).toFixed(2)}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">Scope of Work</Typography>
          <Typography variant="body1">{contract.description || "See attached PDF"}</Typography>
        </Box>

        {contract.materials && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">Materials</Typography>
            <Typography variant="body1">{contract.materials}</Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Terms */}
        <Typography variant="subtitle2" gutterBottom>Terms & Conditions</Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Payment is due upon substantial completion of the project. Invoices are due within 14 days. 
          A late payment fee of 5% may be applied to balances over 15 days past due.
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          All workmanship is warranted for 30 days from completion against defects in installation. 
          Client may cancel before work begins; if materials have been ordered, a restocking fee may apply.
        </Typography>
      </Paper>

      {/* Signature Section */}
      {!alreadySigned && (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Sign This Contract
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            By signing below, you agree to the terms of this service contract.
          </Alert>
          
          <Box sx={{ 
            border: "2px solid",
            borderColor: "primary.main",
            borderRadius: 1,
            p: 1,
            mb: 2,
            backgroundColor: "white",
          }}>
            <Typography variant="subtitle2" gutterBottom sx={{ px: 1 }}>
              Sign with your finger or mouse:
            </Typography>
            <Box sx={{ 
              border: "1px solid #ccc", 
              borderRadius: 1,
              backgroundColor: "#fafafa",
              touchAction: "none",
            }}>
              <SignatureCanvas
                ref={sigPadRef}
                canvasProps={{
                  width: 500,
                  height: 200,
                  style: { 
                    width: "100%", 
                    height: "auto",
                    touchAction: "none",
                  },
                }}
              />
            </Box>
            <Button 
              size="small" 
              onClick={handleClearSignature}
              sx={{ mt: 1 }}
            >
              Clear Signature
            </Button>
          </Box>

          <FormControlLabel
            control={
              <Checkbox 
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2">
                I agree to the terms and conditions of this service contract
              </Typography>
            }
          />

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSign}
            disabled={signing || !agreed}
            sx={{ mt: 2, py: 1.5, fontSize: "1.1rem" }}
          >
            {signing ? "Signing..." : "Sign Contract"}
          </Button>
          <Typography variant="caption" display="block" sx={{ mt: 2, color: "text.secondary", textAlign: "center" }}>
            Your signature will be securely stored and a copy will be sent to your email
          </Typography>
        </Paper>
      )}

      {/* Footer */}
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {COMPANY.name} | {COMPANY.phone} | {COMPANY.email}
        </Typography>
      </Box>
    </Container>
  );
}

// Wrapper component that prevents navigation to main app
export default function ContractSigningPage() {
  return (
    <ThemeProvider theme={publicTheme}>
      <CssBaseline />
      <ContractSigningPageContent />
    </ThemeProvider>
  );
}