import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { User } from '@/types';
import { vi } from 'vitest';

const mockUser: User = {
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  roles: [{ id: '1', name: 'Model_Owner', permissions: ['read:models'] }],
  permissions: ['read:models'],
};

const mockAuthService = {
  isTokenValid: vi.fn(),
  getCurrentUser: vi.fn(),
  setToken: vi.fn(),
  removeToken: vi.fn(),
  logout: vi.fn(),
  getToken: vi.fn(),
};

vi.mock('@/services/auth', () => ({
  authService: mockAuthService,
}));

// Test component to access auth context
const TestComponent: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'loaded'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
      <div data-testid="user-name">{user?.name || 'no-user'}</div>
      <button onClick={() => login('test-token')}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');
    
    consoleSpy.mockRestore();
  });

  it('initializes with loading state', () => {
    mockAuthService.isTokenValid.mockReturnValue(false);
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('loading');
  });

  it('loads user when valid token exists', async () => {
    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
    });

    expect(mockAuthService.getCurrentUser).toHaveBeenCalled();
  });

  it('handles initialization error gracefully', async () => {
    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockRejectedValue(new Error('Network error'));
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('user-name')).toHaveTextContent('no-user');
    });

    expect(mockAuthService.removeToken).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize auth:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });

  it('handles login successfully', async () => {
    mockAuthService.isTokenValid.mockReturnValue(false);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    // Perform login
    const loginButton = screen.getByText('Login');
    await act(async () => {
      loginButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
    });

    expect(mockAuthService.setToken).toHaveBeenCalledWith('test-token');
    expect(mockAuthService.getCurrentUser).toHaveBeenCalled();
  });

  it('handles login error', async () => {
    mockAuthService.isTokenValid.mockReturnValue(false);
    mockAuthService.getCurrentUser.mockRejectedValue(new Error('Invalid token'));
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    // Perform login
    const loginButton = screen.getByText('Login');
    
    await expect(async () => {
      await act(async () => {
        loginButton.click();
      });
    }).rejects.toThrow('Invalid token');

    expect(mockAuthService.setToken).toHaveBeenCalledWith('test-token');
    expect(mockAuthService.removeToken).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Failed to get user after login:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });

  it('handles logout successfully', async () => {
    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
    mockAuthService.logout.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load with user
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    });

    // Perform logout
    const logoutButton = screen.getByText('Logout');
    await act(async () => {
      logoutButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('user-name')).toHaveTextContent('no-user');
    });

    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(mockAuthService.removeToken).toHaveBeenCalled();
  });

  it('handles logout error gracefully', async () => {
    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
    mockAuthService.logout.mockRejectedValue(new Error('Logout failed'));
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial load with user
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    });

    // Perform logout
    const logoutButton = screen.getByText('Logout');
    await act(async () => {
      logoutButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('user-name')).toHaveTextContent('no-user');
    });

    expect(mockAuthService.removeToken).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Logout error:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });

  it('provides correct context values', async () => {
    mockAuthService.isTokenValid.mockReturnValue(true);
    mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
    });
  });
});