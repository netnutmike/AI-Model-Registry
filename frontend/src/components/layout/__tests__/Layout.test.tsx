import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Layout } from '../Layout';
import { AuthProvider } from '@/contexts/AuthContext';
import { vi } from 'vitest';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/dashboard' }),
  };
});

// Mock the auth context
const mockAuthContext = {
  user: {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    roles: [{ id: '1', name: 'Model_Owner', permissions: ['read:models'] }],
    permissions: ['read:models'],
  },
  logout: mockLogout,
  login: vi.fn(),
  isLoading: false,
  isAuthenticated: true,
};

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthContext,
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>
    <AuthProvider>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app bar with title and user info', () => {
    render(
      <TestWrapper>
        <Layout>
          <div>Test Content</div>
        </Layout>
      </TestWrapper>
    );

    expect(screen.getByText('AI Model Registry')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders navigation drawer with all menu items', () => {
    render(
      <TestWrapper>
        <Layout>
          <div>Test Content</div>
        </Layout>
      </TestWrapper>
    );

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Model Catalog')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Evaluations')).toBeInTheDocument();
    expect(screen.getByText('Deployments')).toBeInTheDocument();
    expect(screen.getByText('Audit Trail')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <TestWrapper>
        <Layout>
          <div>Test Content</div>
        </Layout>
      </TestWrapper>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('navigates when menu items are clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <Layout>
          <div>Test Content</div>
        </Layout>
      </TestWrapper>
    );

    const modelCatalogItem = screen.getByText('Model Catalog');
    await user.click(modelCatalogItem);

    expect(mockNavigate).toHaveBeenCalledWith('/models');
  });

  it('opens profile menu when avatar is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <Layout>
          <div>Test Content</div>
        </Layout>
      </TestWrapper>
    );

    const avatarButton = screen.getByLabelText('account of current user');
    await user.click(avatarButton);

    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('calls logout and navigates when logout is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <Layout>
          <div>Test Content</div>
        </Layout>
      </TestWrapper>
    );

    // Open profile menu
    const avatarButton = screen.getByLabelText('account of current user');
    await user.click(avatarButton);

    // Click logout
    const logoutButton = screen.getByText('Logout');
    await user.click(logoutButton);

    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('closes profile menu when clicking outside', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <Layout>
          <div>Test Content</div>
        </Layout>
      </TestWrapper>
    );

    // Open profile menu
    const avatarButton = screen.getByLabelText('account of current user');
    await user.click(avatarButton);

    expect(screen.getByText('Logout')).toBeInTheDocument();

    // Press Escape to close menu (more reliable than clicking outside)
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    });
  });
});