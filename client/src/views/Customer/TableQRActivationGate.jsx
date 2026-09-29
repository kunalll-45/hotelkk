import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { soundManager } from '../../utils/soundEffects';

export default function TableQRActivationGate({
  tableNumber,
  activationInfo,
  onActivated,
  onBackToHome
}) {
  const [customerPhone, setCustomerPhone] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [correctTable, setCorrectTable] = useState(null);
  const [activatedBooking, setActivatedBooking] = useState(null);
  const [devOtp, setDevOtp] = useState('');
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    let timer;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Step 1: Submit Mobile Number to verify booking and request OTP
  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setErrorDetails('');
    setCorrectTable(null);

    const cleanPhone = customerPhone.trim().replace(/[\s+-]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      soundManager.playError();
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setLoading(true);
      soundManager.playPop();

      const result = await api.requestTableActivationOtp(tableNumber, cleanPhone);

      soundManager.playSuccess();
      setDevOtp(result.devOtp || '');
      setStep('otp');
      setCountdown(60);
    } catch (err) {
      soundManager.playError();
      const mainError = err.error || err.message || 'The table is not yours';
      setErrorMessage(mainError.includes('The table is not yours') ? 'The table is not yours' : mainError);
      setErrorDetails(err.details || err.message || 'The booking details do not match this table.');
      if (err.correctTableNumber) {
        setCorrectTable(err.correctTableNumber);
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit OTP to activate table QR session
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setErrorDetails('');

    if (!otpCode.trim() || otpCode.trim().length < 4) {
      soundManager.playError();
      setErrorMessage('Please enter the verification code sent to your mobile.');
      return;
    }

    try {
      setLoading(true);
      soundManager.playPop();

      const result = await api.verifyTableActivationOtp(
        tableNumber,
        customerPhone.trim(),
        otpCode.trim()
      );

      soundManager.playSuccess();
      setActivatedBooking(result.booking);

      setTimeout(() => {
        if (onActivated) {
          onActivated(result.session, result.booking);
        }
      }, 1200);
    } catch (err) {
      soundManager.playError();
      setErrorMessage(err.error || err.message || 'OTP Verification Failed');
      setErrorDetails(err.details || err.message || 'Please verify the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    try {
      setLoading(true);
      const res = await api.requestTableActivationOtp(tableNumber, customerPhone.trim());
      setDevOtp(res.devOtp || '');
      setCountdown(60);
      soundManager.playSuccess();
    } catch (err) {
      soundManager.playError();
      setErrorMessage(err.error || err.message || 'Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const reservation = activationInfo?.reservation;

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col justify-between p-4 sm:p-6 max-w-lg mx-auto">
      {/* Top Brand Banner */}
      <div className="pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-secondary-container text-on-secondary-container flex items-center justify-center font-black shadow-md">
            <span className="material-symbols-outlined text-[24px]">restaurant</span>
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-gray-900 tracking-wide leading-tight">
              K K's Food House
            </h1>
            <p className="text-[10px] text-gray-500 font-mono">Royal Dine-In Table Service</p>
          </div>
        </div>

        {onBackToHome && (
          <button
            onClick={() => {
              soundManager.playPop();
              onBackToHome();
            }}
            className="text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">home</span>
            <span>Home</span>
          </button>
        )}
      </div>

      {/* Main Activation Card */}
      <div className="my-auto py-6 space-y-5">
        {/* Table Number & Status Indicator */}
        <div className="bg-white rounded-3xl p-6 border border-surface-container-high shadow-xl text-center space-y-3 relative overflow-hidden">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black font-mono uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping"></span>
            <span>RESERVED TABLE • VERIFICATION REQUIRED</span>
          </div>

          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono block">
              DINE-IN RESTAURANT TABLE
            </span>
            <h2 className="text-4xl font-black text-gray-900 mt-0.5 tracking-tight">
              Table #{tableNumber}
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Capacity: {activationInfo?.capacity || 4} Guests • Scan & Order Enabled
            </p>
          </div>

          {reservation && (
            <div className="bg-surface-container-low p-3.5 rounded-2xl border border-surface-container-high text-xs text-gray-600 space-y-1">
              <span className="font-bold text-gray-900 block">
                Reserved Slot: {reservation.bookingTime}
              </span>
              <span className="text-[11px] text-gray-500">
                For {reservation.guestsCount} Guests (Booked under {reservation.customerName?.charAt(0)}***)
              </span>
            </div>
          )}
        </div>

        {/* Success Confirmation State */}
        {activatedBooking ? (
          <div className="bg-emerald-50 border-2 border-emerald-400 rounded-3xl p-6 text-center space-y-3 animate-scale-up shadow-md">
            <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md">
              <span className="material-symbols-outlined text-[32px]">check</span>
            </div>
            <h3 className="text-lg font-black text-emerald-950">
              Table #{tableNumber} Activated!
            </h3>
            <p className="text-xs text-emerald-800 font-medium">
              Welcome, <strong>{activatedBooking.customer_name}</strong>! Your table QR session is active. Unlocking royal dine-in ordering...
            </p>
          </div>
        ) : (
          /* Verification Form */
          <div className="bg-white rounded-3xl p-6 border border-surface-container-high shadow-lg space-y-4">
            <div>
              <h3 className="text-base font-black text-gray-900 tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">qr_code_scanner</span>
                <span>
                  {step === 'phone' ? 'Verify Your Table Booking' : 'Enter Table Activation OTP'}
                </span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {step === 'phone'
                  ? 'Enter your registered mobile number to verify and unlock ordering at this table.'
                  : `Enter the 6-digit OTP sent to ${customerPhone} to activate Table #${tableNumber}.`}
              </p>
            </div>

            {/* ERROR NOTICE: "The table is not yours" */}
            {errorMessage && (
              <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 shadow-xs space-y-1.5 animate-shake">
                <div className="flex items-center gap-2 text-rose-800">
                  <span className="material-symbols-outlined text-rose-600 text-[22px]">gpp_bad</span>
                  <h4 className="font-black text-sm uppercase tracking-wide">
                    {errorMessage}
                  </h4>
                </div>
                <p className="text-xs text-rose-900 font-medium leading-relaxed pl-7">
                  {errorDetails}
                </p>

                {correctTable && (
                  <div className="mt-2 pl-7">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-200 text-rose-950 font-black text-xs rounded-xl font-mono">
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      Please go to Table #{correctTable}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* STEP 1: MOBILE NUMBER ENTRY */}
            {step === 'phone' && (
              <form onSubmit={handlePhoneSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                    Registered Mobile Number
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-3 text-gray-400 text-[18px]">
                      call
                    </span>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. 98765 43210"
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-gray-300 rounded-2xl text-xs font-bold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-secondary"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-primary hover:bg-primary-container text-white font-extrabold text-xs rounded-2xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span className="material-symbols-outlined text-[18px] animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                      <span>Verify & Send Activation OTP</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: OTP ENTRY */}
            {step === 'otp' && (
              <form onSubmit={handleOtpSubmit} className="space-y-3.5">
                {devOtp && (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-center">
                    <span className="text-[11px] text-amber-900 font-mono font-bold">
                      Dev Sandbox OTP: <span className="text-sm font-black text-amber-950">{devOtp}</span>
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                    Enter 6-Digit OTP Code
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-3 text-gray-400 text-[18px]">
                      pin
                    </span>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="• • • • • •"
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-gray-300 rounded-2xl text-base tracking-widest font-mono font-black text-center text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-secondary"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="text-gray-500 hover:text-gray-900 underline font-medium text-[11px]"
                  >
                    Change Number
                  </button>

                  <button
                    type="button"
                    disabled={countdown > 0 || loading}
                    onClick={handleResendOtp}
                    className="text-secondary font-bold text-[11px] hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-primary hover:bg-primary-container text-white font-extrabold text-xs rounded-2xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span className="material-symbols-outlined text-[18px] animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">lock_open</span>
                      <span>Verify OTP & Unlock Table #{tableNumber}</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Bottom Footer Notice */}
      <div className="text-center py-2 text-xs text-gray-500 space-y-1">
        <p className="font-medium">
          Need assistance? Call your floor captain or visit the front reception desk.
        </p>
        <p className="text-[10px] text-gray-400 font-mono">
          Security: Only customers with confirmed reservations for Table #{tableNumber} can activate ordering.
        </p>
      </div>
    </div>
  );
}
