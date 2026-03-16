import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { CircularProgress, Box, Typography } from '@mui/material';
import Login from './Login';

// Create Auth Context
const AuthContext = createContext();

// Hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Auth Provider Component with ROLE SUPPORT
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user?.email || 'No user');
      
      if (user) {
        // User is logged in - fetch their role from Firestore
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const role = userDoc.data().role || 'user';
            console.log('User role:', role);
            setUserRole(role);
          } else {
            // No user doc found - default to basic 'user' role
            console.log('No user document found, defaulting to user role');
            setUserRole('user');
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole('user');
        }
      } else {
        setUserRole(null);
      }
      
      setUser(user);
      setLoading(false);
    });

    // Cleanup subscription
    return unsubscribe;
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      console.log('User logged out successfully');
      setUserRole(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Helper functions to check permissions
  const hasRole = (role) => {
    return userRole === role;
  };

  const isGod = () => {
    return userRole === 'god';
  };

  const isAdmin = () => {
    return userRole === 'admin' || userRole === 'god';
  };

  const canAccess = (requiredRole) => {
    const roleHierarchy = {
      'user': 0,
      'admin': 1,
      'god': 2,
    };
    
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    return userLevel >= requiredLevel;
  };

  const value = {
    user,
    userRole,
    logout,
    hasRole,
    isGod,
    isAdmin,
    canAccess,
  };

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">
          Loading KCL Manager...
        </Typography>
      </Box>
    );
  }

  // ✅ Phase 3 Fix: Allow public pages WITHOUT login
  // Public pages include signing pages, payment portal, NDA signing
  const isPublicPage = window.location.pathname.startsWith('/public/');

  // Show login screen if not authenticated AND not on a public page
  if (!user && !isPublicPage) {
    return <Login onLoginSuccess={(user) => setUser(user)} />;
  }

  // User is authenticated OR on a public page - show app
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};