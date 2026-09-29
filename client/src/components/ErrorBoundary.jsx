import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    try {
      localStorage.removeItem('kk_active_role');
      localStorage.removeItem('kk_manager_user');
      localStorage.removeItem('kk_waiter_user');
      localStorage.removeItem('kk_sound_muted');
      sessionStorage.clear();
    } catch (e) {
      console.warn(e);
    }
    // Hard navigate to home with timestamp to bypass stale browser cache
    window.location.replace('/?t=' + Date.now());
  };

  handleReload = () => {
    try {
      window.location.replace(window.location.pathname + '?t=' + Date.now());
    } catch (e) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-on-surface flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-200 space-y-5">
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[36px]">error</span>
            </div>

            <div>
              <h2 className="text-xl font-black text-gray-900">Application View Notice</h2>
              <p className="text-xs text-gray-500 mt-1">
                A display synchronization error occurred. Click below to refresh your session.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-surface-container-low rounded-xl text-left border border-gray-200">
                <span className="text-[10px] text-gray-400 font-mono block">Error Details:</span>
                <span className="text-xs font-mono text-rose-800 break-words font-semibold">
                  {this.state.error.message}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full py-3 bg-primary hover:bg-primary-container text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-transform active:scale-98"
              >
                Reset & Return to Home
              </button>

              <button
                onClick={this.handleReload}
                className="w-full py-2.5 bg-surface-container hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-xl border border-gray-300 cursor-pointer"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
