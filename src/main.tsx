import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { StoreLayout } from './components/Layout';
import { StoreProvider } from './lib/store';
import About from './pages/About';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Product from './pages/Product';
import Shop from './pages/Shop';
import './styles/base.css';
import './styles/store.css';

// The admin is split into its own bundle so customers never download it.
const AdminRoutes = lazy(() => import('./admin/AdminApp'));

const router = createBrowserRouter([
  {
    element: <StoreLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/shop', element: <Shop /> },
      { path: '/shop/:category', element: <Shop /> },
      { path: '/product/:slug', element: <Product /> },
      { path: '/about', element: <About /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/admin/*',
    element: (
      <Suspense fallback={<div className="admin-boot"><span className="spinner" /></div>}>
        <AdminRoutes />
      </Suspense>
    ),
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  </StrictMode>,
);
