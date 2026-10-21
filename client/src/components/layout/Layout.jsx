import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

/**
 * APP LAYOUT
 * ==========
 * Desktop (lg and up): the sidebar is permanently docked on the left.
 * Mobile: the sidebar is an off-canvas drawer controlled by `sidebarOpen`.
 *
 * The drawer closes on:
 *   - the overlay being tapped,
 *   - the sidebar's close button,
 *   - the Escape key,
 *   - navigating to another page (handled inside Sidebar).
 */
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);

  // Escape closes the drawer.
  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeSidebar();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, closeSidebar]);

  // Prevent the page behind the drawer from scrolling on small screens.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      {/* Content column. `lg:pl-64` reserves the docked sidebar's width. */}
      <div className="transition-[padding] duration-200 lg:pl-64">
        <Header onMenuClick={toggleSidebar} />

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Backdrop behind the mobile drawer. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
