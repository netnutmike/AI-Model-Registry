import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { vi } from 'vitest';

// Mock the auth service
const mockAuthService = {
  isTokenValid: vi.fn(),
  getCurrentUser: vi.fn(),
  getToken: vi.fn(),
};

vi.mock('@/services/auth', () => ({
  authService: mockAuthService,
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>
    <AuthProvider>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

const TestComponent = () => <div>Protected Content</div>;

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner when authentication is loading', () => {
    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockReturnValue(Promise.resolve(null));
    mockAuthService.getToken.mockReturnValue('token');

    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders children when user is authenticated', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      roles: [{ id: '1', name: 'Model_Owner', permissions: ['read:models'] }],
      permissions: ['read:models'],
    };

    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
    mockAuthService.getToken.mockReturnValue('valid-token');

    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    await screen.findByText('Protected Content');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('blocks access when user lacks required permissions', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      roles: [{ id: '1', name: 'Model_Owner', permissions: ['read:models'] }],
      permissions: ['read:models'],
    };

    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
    mockAuthService.getToken.mockReturnValue('valid-token');

    render(
      <TestWrapper>
        <ProtectedRoute requiredPermissions={['admin:all']}>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should redirect to unauthorized, not show protected content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('allows access when user has required permissions', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      roles: [{ id: '1', name: 'Admin', permissions: ['admin:all'] }],
      permissions: ['admin:all', 'read:models'],
    };

    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
    mockAuthService.getToken.mockReturnValue('valid-token');

    render(
      <TestWrapper>
        <ProtectedRoute requiredPermissions={['admin:all']}>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    await screen.findByText('Protected Content');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('allows access when user has required role', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      roles: [{ id: '1', name: 'MRC', permissions: ['review:approvals'] }],
      permissions: ['review:approvals'],
    };

    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
    mockAuthService.getToken.mockReturnValue('valid-token');

    render(
      <TestWrapper>
        <ProtectedRoute requiredRoles={['MRC']}>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    await screen.findByText('Protected Content');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('blocks access when user lacks required role', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      roles: [{ id: '1', name: 'Model_Owner', permissions: ['read:models'] }],
      permissions: ['read:models'],
    };

    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
    mockAuthService.getToken.mockReturnValue('valid-token');

    render(
      <TestWrapper>
        <ProtectedRoute requiredRoles={['MRC']}>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should redirect to unauthorized, not show protected content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});