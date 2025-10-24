import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Unauthorized } from '@/pages/Unauthorized';
import { ModelCatalog } from '@/pages/ModelCatalog';
import { ModelDetail } from '@/pages/ModelDetail';
import { Governance } from '@/pages/Governance';
import { Deployments } from '@/pages/Deployments';

// Placeholder components for routes that will be implemented in later tasks
const Evaluations = () => <div>Evaluations - Coming Soon</div>;
const AuditTrail = () => <div>Audit Trail - Coming Soon</div>;

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Protected routes with layout */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/models"
        element={
          <ProtectedRoute>
            <Layout>
              <ModelCatalog />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/models/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <ModelDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/governance"
        element={
          <ProtectedRoute requiredRoles={['MRC', 'Security_Architect']}>
            <Layout>
              <Governance />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/evaluations"
        element={
          <ProtectedRoute>
            <Layout>
              <Evaluations />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/deployments"
        element={
          <ProtectedRoute requiredRoles={['SRE', 'Model_Owner']}>
            <Layout>
              <Deployments />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/audit"
        element={
          <ProtectedRoute requiredRoles={['Auditor', 'MRC']}>
            <Layout>
              <AuditTrail />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* Catch all route */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};