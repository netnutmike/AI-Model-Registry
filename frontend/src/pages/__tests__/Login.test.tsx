import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Login } from '../Login';
import { AuthProvider } from '@/contexts/AuthContext';
import { vi } from 'vitest';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: false,
    isLoading: false,
    user: null,
  }),
}));

const mockAuthService = {
  login: vi.fn(),
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

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form correctly', () => {
    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    expect(screen.getByText('AI Model Registry')).toBeInTheDocument();
    expect(screen.getByText('Sign in to access the platform')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('validates email field', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    await user.type(emailField, 'invalid-email');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
  });

  it('validates password field', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    await user.type(emailField, 'test@example.com');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('submits form with valid credentials', async () => {
    const user = userEvent.setup();
    
    mockAuthService.login.mockResolvedValue({ token: 'valid-token' });

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const passwordField = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    await user.type(emailField, 'test@example.com');
    await user.type(passwordField, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAuthService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    expect(mockLogin).toHaveBeenCalledWith('valid-token');
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('displays error message on login failure', async () => {
    const user = userEvent.setup();
    
    mockAuthService.login.mockRejectedValue({
      response: {
        data: {
          error: {
            message: 'Invalid credentials',
          },
        },
      },
    });

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const passwordField = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    await user.type(emailField, 'test@example.com');
    await user.type(passwordField, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('displays generic error message when no specific error provided', async () => {
    const user = userEvent.setup();
    
    mockAuthService.login.mockRejectedValue(new Error('Network error'));

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const passwordField = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    await user.type(emailField, 'test@example.com');
    await user.type(passwordField, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
  });

  it('shows loading state during login', async () => {
    const user = userEvent.setup();
    
    // Create a promise that we can control
    let resolveLogin: (value: any) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    
    mockAuthService.login.mockReturnValue(loginPromise);

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const passwordField = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    await user.type(emailField, 'test@example.com');
    await user.type(passwordField, 'password123');
    await user.click(submitButton);

    // Should show loading spinner
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    // Resolve the login
    resolveLogin!({ token: 'valid-token' });

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  it('redirects to intended page after login', async () => {
    const user = userEvent.setup();
    
    // Mock location with state
    const { useLocation } = require('react-router-dom');
    useLocation.mockReturnValue({
      state: { from: { pathname: '/models' } },
    });

    mockAuthService.login.mockResolvedValue({ token: 'valid-token' });

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const passwordField = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    await user.type(emailField, 'test@example.com');
    await user.type(passwordField, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/models', { replace: true });
    });
  });

  it('clears error when user starts typing', async () => {
    const user = userEvent.setup();
    
    mockAuthService.login.mockRejectedValue({
      response: {
        data: {
          error: {
            message: 'Invalid credentials',
          },
        },
      },
    });

    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const passwordField = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    // First, trigger an error
    await user.type(emailField, 'test@example.com');
    await user.type(passwordField, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    // Clear the error by making another attempt
    mockAuthService.login.mockResolvedValue({ token: 'valid-token' });
    
    await user.clear(passwordField);
    await user.type(passwordField, 'correctpassword');
    await user.click(submitButton);

    // Error should be cleared during the new attempt
    await waitFor(() => {
      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
    });
  });

  it('has proper form accessibility', () => {
    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    );

    const emailField = screen.getByLabelText('Email');
    const passwordField = screen.getByLabelText('Password');

    expect(emailField).toHaveAttribute('type', 'email');
    expect(emailField).toHaveAttribute('autoComplete', 'email');
    expect(emailField).toHaveAttribute('autoFocus');

    expect(passwordField).toHaveAttribute('type', 'password');
    expect(passwordField).toHaveAttribute('autoComplete', 'current-password');
  });
});