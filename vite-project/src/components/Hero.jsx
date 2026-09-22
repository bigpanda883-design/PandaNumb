import { useEffect, useState } from "react";
import {
  FiArrowRight,
  FiEye,
  FiPlus,
  FiSmartphone,
  FiArrowUpRight,
  FiArrowDownLeft,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import "../CSS/Hero.css";

const HeroSection = () => {
  const [balance, setBalance] = useState(0);
  const targetBalance = 25400;

  useEffect(() => {
    let start = 0;
    const duration = 1800;
    const steps = 60;
    const increment = targetBalance / steps;
    const stepTime = duration / steps;

    const timer = setInterval(() => {
      start += increment;
      if (start >= targetBalance) {
        setBalance(targetBalance);
        clearInterval(timer);
      } else {
        setBalance(Math.floor(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, []);

  const formattedBalance = balance.toLocaleString("en-US");

  return (
    <section className="hero-wrapper">
      <div className="hero-container">
        <div className="hero-left">
          <div className="badge-pill">
            <span className="dot"></span>
            <span className="badge-text">Wallet deposits from ₦100</span>
          </div>

          <h1 className="hero-title">
            Virtual Numbers.
            <br />
            Simple. Secure.
            <br />
            <span className="title-blue">
              Ready When You
              <br />
              Are.
            </span>
          </h1>

          <p className="hero-subtitle">
            Buy virtual numbers for the services you need, fund your wallet
            <br />
            securely, and manage everything from one simple dashboard.
          </p>

          <div className="hero-actions">
            <Link className="btn-primary" to="/signup">
              Get Started <FiArrowRight className="btn-icon" />
            </Link>
            <Link className="btn-secondary" to="/signup">
              Buy a Number
            </Link>
          </div>

          <div className="hero-stats">
            <div className="stat-item">
              <h3 className="stat-value">₦100</h3>
              <p className="stat-label">Minimum deposit</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-value">6+</h3>
              <p className="stat-label">Supported services</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-value">24/7</h3>
              <p className="stat-label">Wallet access</p>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="dashboard-card float-animation">
            <div className="card-header">
              <div className="user-profile">
                <div className="user-avatar">P.</div>
                <div className="user-info">
                  <span className="greeting">Good morning</span>
                  <h4 className="user-name">Amaka O.</h4>
                </div>
              </div>
              <span className="verified-badge">VERIFIED</span>
            </div>

            <div className="wallet-card">
              <div className="wallet-header">
                <span className="wallet-title">Available Balance</span>
                <FiEye className="eye-icon" />
              </div>
              <div className="wallet-amount">
                <span className="currency">₦</span>
                <span className="amount">{formattedBalance}</span>
                <span className="decimals">.00</span>
              </div>
              <div className="wallet-actions">
                <Link className="wallet-btn deposit" to="/signup">
                  <FiPlus /> Deposit
                </Link>
                <Link className="wallet-btn buy" to="/signup">
                  <FiSmartphone /> Buy Number
                </Link>
              </div>
            </div>

            <div className="recent-section">
              <div className="recent-header">
                <span>Recent transactions</span>
                <Link className="view-all" to="/signup">
                  View all
                </Link>
              </div>

              <div className="tx-list">
                <div className="tx-item">
                  <div className="tx-icon green">
                    <FiArrowDownLeft />
                  </div>
                  <div className="tx-details">
                    <span className="tx-title">Wallet deposit</span>
                    <span className="tx-time">Today · 09:12</span>
                  </div>
                  <span className="tx-amount positive">+₦10,000</span>
                </div>

                <div className="tx-item">
                  <div className="tx-icon blue">
                    <FiArrowUpRight />
                  </div>
                  <div className="tx-details">
                    <span className="tx-title">WhatsApp · Nigeria</span>
                    <span className="tx-time">Today · 08:40</span>
                  </div>
                  <span className="tx-amount negative">-₦2,000</span>
                </div>

                <div className="tx-item">
                  <div className="tx-icon blue">
                    <FiArrowUpRight />
                  </div>
                  <div className="tx-details">
                    <span className="tx-title">Telegram · Ghana</span>
                    <span className="tx-time">Yesterday</span>
                  </div>
                  <span className="tx-amount negative">-₦2,800</span>
                </div>
              </div>
            </div>

            <div className="my-numbers-box">
              <span className="box-title">My Numbers</span>
              <div className="number-row">
                <div className="avatar-square">NG</div>
                <div className="number-info">
                  <span className="phone-num">+234 802 441 0072</span>
                  <span className="phone-sub">WhatsApp · active</span>
                </div>
                <span className="otp-badge">OTP READY</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
