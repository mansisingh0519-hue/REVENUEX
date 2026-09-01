
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000";

/* =========================================================
   SMALL UI HELPERS
========================================================= */

function StatusBadge({ children, type = "" }) {
  return (
    <span className={`status-badge ${type}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && (
          <p className="panel-description">
            {description}
          </p>
        )}
      </div>

      {action && (
        <div className="section-header-action">
          {action}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  variant = "",
  icon,
}) {
  return (
    <div className={`metric-card ${variant}`}>
      <div className="metric-top">
        <span>{label}</span>
        {icon && (
          <span className="metric-icon">
            {icon}
          </span>
        )}
      </div>

      <strong>{value}</strong>

      {description && (
        <small>{description}</small>
      )}
    </div>
  );
}

function EmptyState({
  title = "Nothing here yet",
  description = "",
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">○</div>

      <strong>{title}</strong>

      {description && <p>{description}</p>}
    </div>
  );
}

/* =========================================================
   APP
========================================================= */

function App() {
  /* =======================================================
     DASHBOARD STATE
  ======================================================= */

  const [analytics, setAnalytics] = useState(null);
  const [recoveryMetrics, setRecoveryMetrics] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [experiment, setExperiment] = useState(null);

  /* =======================================================
     SELECTED TRANSACTION
  ======================================================= */

  const [selectedTransaction, setSelectedTransaction] =
    useState(null);

  const [analysis, setAnalysis] = useState(null);
  const [executionResult, setExecutionResult] =
    useState(null);

  /* =======================================================
     RECOVERY TIMELINE
  ======================================================= */

  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] =
    useState(false);

  /* =======================================================
     LOADING STATES
  ======================================================= */

  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] =
    useState(false);
  const [scenarioLoading, setScenarioLoading] =
    useState(false);
  const [executionLoading, setExecutionLoading] =
    useState(false);
  const [experimentLoading, setExperimentLoading] =
    useState(false);

  /* =======================================================
     PAYMENT PLAYGROUND
  ======================================================= */

  const [paymentAmount, setPaymentAmount] =
    useState(500);

  const [customerEmail, setCustomerEmail] =
    useState("demo@revenuex.test");

  const [paymentLoading, setPaymentLoading] =
    useState(false);

  /* =======================================================
     UI FEEDBACK
  ======================================================= */

  const [notice, setNotice] = useState(null);

  /* =======================================================
     NOTICE
  ======================================================= */

  const showNotice = (message, type = "info") => {
    setNotice({
      message,
      type,
    });

    window.setTimeout(() => {
      setNotice(null);
    }, 4500);
  };

  /* =======================================================
     LOAD DASHBOARD
  ======================================================= */

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const [
        analyticsResponse,
        metricsResponse,
        transactionsResponse,
        auditResponse,
        experimentResponse,
      ] = await Promise.all([
        fetch(`${API}/api/analytics/overview`),
        fetch(`${API}/api/recovery-metrics/overview`),
        fetch(`${API}/api/transactions`),
        fetch(`${API}/api/audit`),
        fetch(`${API}/api/experiments/latest`),
      ]);

      const analyticsData =
        await analyticsResponse.json();

      const metricsData =
        await metricsResponse.json();

      const transactionsData =
        await transactionsResponse.json();

      const auditData =
        await auditResponse.json();

      const experimentData =
        await experimentResponse.json();

      if (analyticsData.success) {
        setAnalytics(
          analyticsData.analytics
        );
      }

      if (metricsData.success) {
        setRecoveryMetrics(
          metricsData.metrics
        );
      }

      if (transactionsData.success) {
        setTransactions(
          transactionsData.transactions || []
        );
      }

      if (auditData.success) {
        setAuditLogs(
          auditData.logs || []
        );
      }

      if (experimentData.success) {
        setExperiment(
          experimentData.experiment
        );
      }
    } catch (error) {
      console.error(
        "Dashboard loading error:",
        error
      );

      showNotice(
        "Unable to refresh dashboard data.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  /* =======================================================
     LOAD TIMELINE
  ======================================================= */

  const loadRecoveryTimeline = async (
    transactionId
  ) => {
    if (!transactionId) {
      setTimeline([]);
      return;
    }

    try {
      setTimelineLoading(true);

      const response = await fetch(
        `${API}/api/audit`
      );

      const data = await response.json();

      if (!data.success) {
        setTimeline([]);
        return;
      }

      const logs = data.logs || [];

      const transactionTimeline =
        logs.filter((log) => {
          const logTransactionId =
            log.transactionId?._id ||
            log.transactionId;

          return (
            String(logTransactionId) ===
            String(transactionId)
          );
        });

      transactionTimeline.sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );

      setTimeline(
        transactionTimeline
      );
    } catch (error) {
      console.error(
        "Timeline loading error:",
        error
      );

      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    loadDashboard();
  }, []);

  /* =======================================================
     PAYMENT
  ======================================================= */

  const startPayment = async () => {
    try {
      if (
        !paymentAmount ||
        Number(paymentAmount) <= 0
      ) {
        showNotice(
          "Enter a valid payment amount.",
          "error"
        );
        return;
      }

      if (!customerEmail) {
        showNotice(
          "Enter a customer email.",
          "error"
        );
        return;
      }

      if (!window.Razorpay) {
        showNotice(
          "Razorpay Checkout is not available. Refresh the page and try again.",
          "error"
        );
        return;
      }

      setPaymentLoading(true);

      const orderResponse = await fetch(
        `${API}/api/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount:
              Number(paymentAmount),
            customer: {
              email: customerEmail,
            },
          }),
        }
      );

      const orderData =
        await orderResponse.json();

      if (
        !orderResponse.ok ||
        !orderData.success
      ) {
        throw new Error(
          orderData.message ||
            "Unable to create Razorpay order"
        );
      }

      const order =
        orderData.order;

      const options = {
        key:
          import.meta.env
            .VITE_RAZORPAY_KEY_ID,

        amount: order.amount,

        currency:
          order.currency,

        name: "REVENUEX",

        description:
          "Revenue Recovery Demo Payment",

        order_id: order.id,

        prefill: {
          email:
            customerEmail,
        },

        theme: {
          color: "#111111",
        },

        handler: async function (
          response
        ) {
          try {
            const verifyResponse =
              await fetch(
                `${API}/api/payments/verify`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                  body:
                    JSON.stringify(
                      response
                    ),
                }
              );

            const verifyData =
              await verifyResponse.json();

            if (
              !verifyData.success
            ) {
              showNotice(
                verifyData.message ||
                  "Payment verification failed.",
                "error"
              );
              return;
            }

            showNotice(
              "Payment successful and verified.",
              "success"
            );

            await loadDashboard();
          } catch (error) {
            console.error(
              "Payment verification error:",
              error
            );

            showNotice(
              "Payment succeeded but verification failed.",
              "error"
            );
          }
        },

        modal: {
          ondismiss:
            function () {
              console.log(
                "Razorpay checkout closed"
              );
            },
        },
      };

      const razorpay =
        new window.Razorpay(
          options
        );

      razorpay.on(
        "payment.failed",
        async function (
          response
        ) {
          console.log(
            "Payment failed:",
            response.error
          );

          try {
            const error =
              response.error || {};

            const orderId =
              error.metadata
                ?.order_id ||
              order.id;

            const paymentId =
              error.metadata
                ?.payment_id ||
              null;

            const failureResponse =
              await fetch(
                `${API}/api/payments/failed`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                  body:
                    JSON.stringify({
                      razorpay_order_id:
                        orderId,

                      razorpay_payment_id:
                        paymentId,

                      error_code:
                        error.code,

                      error_description:
                        error.description,

                      error_reason:
                        error.reason,

                      error_source:
                        error.source,

                      error_step:
                        error.step,
                    }),
                }
              );

            const failureData =
              await failureResponse.json();

            console.log(
              "Failure recorded:",
              failureData
            );

            await loadDashboard();

            showNotice(
              "Payment failed. REVENUEX has recorded the failure.",
              "warning"
            );
          } catch (error) {
            console.error(
              "Failure recording error:",
              error
            );

            showNotice(
              "Payment failed, but REVENUEX could not record the failure.",
              "error"
            );
          }
        }
      );

      razorpay.open();
    } catch (error) {
      console.error(
        "Payment initialization error:",
        error
      );

      showNotice(
        error.message ||
          "Unable to start payment.",
        "error"
      );
    } finally {
      setPaymentLoading(false);
    }
  };

  /* =======================================================
     CREATE SCENARIO
  ======================================================= */

  const createScenario = async (
    scenario
  ) => {
    try {
      setScenarioLoading(true);

      const response = await fetch(
        `${API}/api/scenarios/create`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            scenario,
          }),
        }
      );

      const data =
        await response.json();

      if (!data.success) {
        showNotice(
          data.message ||
            "Unable to create scenario.",
          "error"
        );
        return;
      }

      setSelectedTransaction(
        data.transaction
      );

      setAnalysis(null);
      setExecutionResult(null);
      setTimeline([]);

      await analyzeTransaction(
        data.transaction
      );

      await loadDashboard();

      showNotice(
        "Scenario created and analyzed.",
        "success"
      );
    } catch (error) {
      console.error(
        "Scenario creation error:",
        error
      );

      showNotice(
        "Unable to create scenario.",
        "error"
      );
    } finally {
      setScenarioLoading(false);
    }
  };

  /* =======================================================
     ANALYZE TRANSACTION
  ======================================================= */

  const analyzeTransaction = async (
    transaction
  ) => {
    try {
      setSelectedTransaction(
        transaction
      );

      setAnalysis(null);
      setExecutionResult(null);
      setTimeline([]);

      setAnalysisLoading(true);

      const response = await fetch(
        `${API}/api/recovery/${transaction._id}`
      );

      const data =
        await response.json();

      if (!data.success) {
        showNotice(
          data.message ||
            "Unable to analyze payment.",
          "error"
        );
        return;
      }

      setAnalysis(data);

      await loadRecoveryTimeline(
        transaction._id
      );
    } catch (error) {
      console.error(
        "Analysis error:",
        error
      );

      showNotice(
        "Unable to analyze payment.",
        "error"
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  /* =======================================================
     EXECUTE RECOVERY
  ======================================================= */

  const executeRecovery = async () => {
    if (!selectedTransaction) {
      return;
    }

    if (!analysis?.policy?.allowed) {
      return;
    }

    try {
      setExecutionLoading(true);

      const response =
        await fetch(
          `${API}/api/recovery-actions/${selectedTransaction._id}/execute`,
          {
            method: "POST",
          }
        );

      const data =
        await response.json();

      if (!data.success) {
        showNotice(
          data.message ||
            "Recovery execution failed.",
          "error"
        );
        return;
      }

      setExecutionResult(data);

      await loadDashboard();

      await loadRecoveryTimeline(
        selectedTransaction._id
      );

      showNotice(
        "Recovery action completed.",
        "success"
      );
    } catch (error) {
      console.error(
        "Recovery execution error:",
        error
      );

      showNotice(
        "Unable to execute recovery.",
        "error"
      );
    } finally {
      setExecutionLoading(false);
    }
  };

  /* =======================================================
     RUN BENCHMARK
  ======================================================= */

  const runExperiment = async () => {
    try {
      setExperimentLoading(true);

      const response =
        await fetch(
          `${API}/api/experiments/run`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              count: 100,
            }),
          }
        );

      const data =
        await response.json();

      if (!data.success) {
        showNotice(
          data.message ||
            "Benchmark failed.",
          "error"
        );
        return;
      }

      setExperiment(
        data.experiment
      );

      await loadDashboard();

      showNotice(
        "100-case benchmark completed.",
        "success"
      );
    } catch (error) {
      console.error(
        "Benchmark error:",
        error
      );

      showNotice(
        "Unable to run benchmark.",
        "error"
      );
    } finally {
      setExperimentLoading(false);
    }
  };

  /* =======================================================
     CLOSE DECISION CENTER
  ======================================================= */

  const closeDecisionCenter = () => {
    setSelectedTransaction(null);
    setAnalysis(null);
    setExecutionResult(null);
    setTimeline([]);
  };

  /* =======================================================
     FORMATTERS
  ======================================================= */

  const money = (value) =>
    `₹${Number(
      value || 0
    ).toLocaleString("en-IN")}`;

  const percent = (value) =>
    `${Number(value || 0)}%`;

  const pretty = (value) =>
    String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      );

  const timelineTitle = (
    eventType
  ) => pretty(eventType);

  /* =======================================================
     LOADING SCREEN
  ======================================================= */

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-brand">
          REVENUEX
        </div>

        <div className="loading-spinner" />

        <p>
          Initializing revenue intelligence...
        </p>
      </div>
    );
  }

  /* =======================================================
     DERIVED VALUES
  ======================================================= */

  const failedTransactions =
    analytics?.failedTransactions || 0;

  const totalTransactions =
    analytics?.totalTransactions || 0;

  const recoveryAttempts =
    recoveryMetrics?.recoveryAttempts || 0;

  const recovered =
    recoveryMetrics?.totalRecovered || 0;

  const revenueAtRisk =
    analytics?.failedRevenue || 0;

  const recoveryRate =
    recoveryMetrics?.recoveryRate || 0;

  const policySafe =
    experiment &&
    experiment.policyViolations === 0;

  /* =======================================================
     MAIN
  ======================================================= */

  return (
    <div className="dashboard">

      {/* ===================================================
          TOPBAR
      =================================================== */}

      <header className="topbar">

        <div className="brand-area">

          <div className="logo">
            REVENUEX
          </div>

          <div className="tagline">
            Autonomous AI Revenue Recovery
          </div>

        </div>

        <div className="topbar-right">

          <div className="system-status">
            <span className="status-dot online" />
            System operational
          </div>

          <div className="mode-pill">
            TEST MODE
          </div>

          <button
            className="top-btn"
            onClick={loadDashboard}
          >
            ↻ Refresh
          </button>

        </div>

      </header>

      {/* ===================================================
          NOTICE
      =================================================== */}

      {notice && (
        <div
          className={`notice notice-${notice.type}`}
        >
          <span>
            {notice.type === "success"
              ? "✓"
              : notice.type === "error"
              ? "!"
              : "•"}
          </span>

          <p>{notice.message}</p>

          <button
            onClick={() =>
              setNotice(null)
            }
          >
            ×
          </button>
        </div>
      )}

      <main className="main">

        {/* =================================================
            HERO
        ================================================= */}

        <section className="hero">

          <div className="hero-content">

            <div className="eyebrow">
              PAYMENT INTELLIGENCE
            </div>

            <h1>
              Recover revenue.
              <br />
              <span>Intelligently.</span>
            </h1>

            <p>
              REVENUEX detects failed payments,
              understands customer context,
              evaluates recovery potential and
              enforces financial safety policies
              before any recovery action is executed.
            </p>

            <div className="hero-flow">

              <div className="flow-step">
                <span>01</span>
                Detect
              </div>

              <div className="flow-line" />

              <div className="flow-step">
                <span>02</span>
                Analyze
              </div>

              <div className="flow-line" />

              <div className="flow-step">
                <span>03</span>
                Authorize
              </div>

              <div className="flow-line" />

              <div className="flow-step">
                <span>04</span>
                Recover
              </div>

            </div>

          </div>

          <div className="hero-side">

            <div className="hero-side-label">
              RECOVERY ENGINE
            </div>

            <strong>
              AI-assisted
            </strong>

            <span>
              Deterministic policy enforcement
            </span>

            <div className="hero-divider" />

            <div className="hero-mini-row">
              <span>AI decides</span>
              <b>→</b>
            </div>

            <div className="hero-mini-row">
              <span>Policy validates</span>
              <b>→</b>
            </div>

            <div className="hero-mini-row">
              <span>Agent executes</span>
              <b>✓</b>
            </div>

          </div>

        </section>

        {/* =================================================
            PRIMARY METRICS
        ================================================= */}

        <section className="metrics-grid">

          <MetricCard
            label="Total Revenue"
            value={money(
              analytics?.totalRevenue
            )}
            description={`${totalTransactions} transactions processed`}
          />

          <MetricCard
            label="Revenue at Risk"
            value={money(revenueAtRisk)}
            description={`${failedTransactions} failed payments`}
            variant="danger-card"
          />

          <MetricCard
            label="Revenue Recovered"
            value={money(recovered)}
            description={`${recoveryAttempts} recovery attempts`}
            variant="success-card"
          />

          <MetricCard
            label="Recovery Rate"
            value={percent(recoveryRate)}
            description="Current recovery performance"
          />

        </section>

        {/* =================================================
            SECONDARY METRICS
        ================================================= */}

        <section className="secondary-grid">

          <div>
            <span>Transactions</span>
            <strong>
              {totalTransactions}
            </strong>
          </div>

          <div>
            <span>Failed</span>
            <strong>
              {failedTransactions}
            </strong>
          </div>

          <div>
            <span>Recovery Attempts</span>
            <strong>
              {recoveryAttempts}
            </strong>
          </div>

          <div>
            <span>Escalated</span>
            <strong>
              {recoveryMetrics?.escalatedTransactions || 0}
            </strong>
          </div>

          <div>
            <span>Stopped</span>
            <strong>
              {recoveryMetrics?.stoppedTransactions || 0}
            </strong>
          </div>

        </section>

        {/* =================================================
            PAYMENT PLAYGROUND
        ================================================= */}

        <section className="panel payment-panel">

          <SectionHeader
            eyebrow="PAYMENT PLAYGROUND"
            title="Test the recovery system"
            description="Create a Razorpay test payment and observe how REVENUEX responds to the resulting payment event."
          />

          <div className="payment-workspace">

            <div className="payment-form">

              <div className="payment-field">

                <label htmlFor="payment-amount">
                  Payment amount
                </label>

                <div className="amount-input">

                  <span>₹</span>

                  <input
                    id="payment-amount"
                    type="number"
                    min="1"
                    value={paymentAmount}
                    onChange={(e) =>
                      setPaymentAmount(
                        e.target.value
                      )
                    }
                  />

                </div>

              </div>

              <div className="payment-field">

                <label htmlFor="customer-email">
                  Customer email
                </label>

                <input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) =>
                    setCustomerEmail(
                      e.target.value
                    )
                  }
                  placeholder="demo@revenuex.test"
                />

              </div>

              <button
                type="button"
                className="pay-button"
                onClick={startPayment}
                disabled={paymentLoading}
              >
                {paymentLoading
                  ? "Opening Checkout..."
                  : `Pay ₹${Number(
                      paymentAmount || 0
                    ).toLocaleString("en-IN")}`}
              </button>

            </div>

            <div className="payment-explainer">

              <div className="payment-explainer-icon">
                ↗
              </div>

              <div>
                <strong>
                  Razorpay Test Mode
                </strong>

                <p>
                  Use the simulated checkout to
                  generate successful or failed
                  payment events.
                </p>
              </div>

              <span className="test-label">
                SAFE
              </span>

            </div>

          </div>

        </section>

        {/* =================================================
            SCENARIO LAB
        ================================================= */}

        <section className="panel">

          <SectionHeader
            eyebrow="CONTROLLED DEMO"
            title="Recovery Scenario Lab"
            description="Create known payment situations and observe how the recovery intelligence and policy engine respond."
          />

          <div className="scenario-grid">

            {/* HIGH RECOVERY */}

            <button
              className="scenario-card scenario-positive"
              disabled={scenarioLoading}
              onClick={() =>
                createScenario(
                  "high_recovery"
                )
              }
            >

              <div className="scenario-number">
                01
              </div>

              <div className="scenario-card-body">

                <strong>
                  High Recovery
                </strong>

                <span>
                  Strong customer history and
                  high recovery potential.
                </span>

                <div className="scenario-decision">
                  <b>AI</b>
                  RETRY

                  <i>→</i>

                  <b>POLICY</b>
                  ALLOW
                </div>

              </div>

              <span className="scenario-arrow">
                →
              </span>

            </button>

            {/* MEDIUM RECOVERY */}

            <button
              className="scenario-card scenario-positive"
              disabled={scenarioLoading}
              onClick={() =>
                createScenario(
                  "medium_recovery"
                )
              }
            >

              <div className="scenario-number">
                02
              </div>

              <div className="scenario-card-body">

                <strong>
                  Medium Recovery
                </strong>

                <span>
                  Established customer history
                  with moderate recovery potential.
                </span>

                <div className="scenario-decision">
                  <b>AI</b>
                  REVIEW

                  <i>→</i>

                  <b>POLICY</b>
                  BLOCK
                </div>

              </div>

              <span className="scenario-arrow">
                →
              </span>

            </button>

            {/* WEAK CUSTOMER */}

            <button
              className="scenario-card scenario-warning"
              disabled={scenarioLoading}
              onClick={() =>
                createScenario(
                  "weak_customer"
                )
              }
            >

              <div className="scenario-number">
                03
              </div>

              <div className="scenario-card-body">

                <strong>
                  Weak Customer
                </strong>

                <span>
                  Limited history creates
                  uncertainty around recovery.
                </span>

                <div className="scenario-decision">
                  <b>AI</b>
                  REVIEW

                  <i>→</i>

                  <b>POLICY</b>
                  BLOCK
                </div>

              </div>

              <span className="scenario-arrow">
                →
              </span>

            </button>

            {/* HIGH RISK */}

            <button
              className="scenario-card scenario-danger"
              disabled={scenarioLoading}
              onClick={() =>
                createScenario(
                  "high_risk"
                )
              }
            >

              <div className="scenario-number">
                04
              </div>

              <div className="scenario-card-body">

                <strong>
                  High Risk
                </strong>

                <span>
                  High-value payment with
                  retry-limit or risk concerns.
                </span>

                <div className="scenario-decision">
                  <b>AI</b>
                  STOP

                  <i>→</i>

                  <b>POLICY</b>
                  BLOCK
                </div>

              </div>

              <span className="scenario-arrow">
                →
              </span>

            </button>

          </div>

          {scenarioLoading && (
            <div className="inline-loading">

              <span className="loading-spinner small" />

              Creating controlled scenario and
              running recovery intelligence...

            </div>
          )}

        </section>

        {/* =================================================
            BENCHMARK
        ================================================= */}

        <section className="panel experiment-panel">

          <div className="benchmark-header">

            <SectionHeader
              eyebrow="VALIDATION"
              title="Recovery Benchmark"
              description="A controlled 100-case evaluation of AI decisions, policy enforcement and simulated recovery outcomes."
            />

            <button
              className="experiment-btn"
              disabled={experimentLoading}
              onClick={runExperiment}
            >
              {experimentLoading
                ? "Running benchmark..."
                : "Run 100 Cases →"}
            </button>

          </div>

          {!experiment && (
            <EmptyState
              title="No benchmark run yet"
              description="Run the controlled benchmark to validate recovery intelligence and policy safety."
            />
          )}

          {experiment && (
            <div className="experiment-content">

              <div className="benchmark-status-row">

                <div className="benchmark-badge">
                  SYNTHETIC BENCHMARK
                </div>

                <span>
                  Run {experiment.runId}
                </span>

                <div className="benchmark-safe">

                  <span className="status-dot online" />

                  {policySafe
                    ? "Policy safe"
                    : "Policy issues detected"}

                </div>

              </div>

              {/* BENCHMARK PIPELINE */}

              <div className="benchmark-pipeline">

                <div>
                  <span>100</span>
                  <small>
                    Payments tested
                  </small>
                </div>

                <div className="pipeline-arrow">
                  →
                </div>

                <div>
                  <span>
                    {experiment.correctDecisions || 0}
                  </span>

                  <small>
                    Correct decisions
                  </small>
                </div>

                <div className="pipeline-arrow">
                  →
                </div>

                <div>
                  <span>
                    {experiment.blockedActions || 0}
                  </span>

                  <small>
                    Policy blocks
                  </small>
                </div>

                <div className="pipeline-arrow">
                  →
                </div>

                <div className="pipeline-result">

                  <span>
                    {money(
                      experiment.totalRecovered
                    )}
                  </span>

                  <small>
                    Recovered
                  </small>

                </div>

              </div>

              {/* PRIMARY BENCHMARK NUMBERS */}

              <div className="benchmark-metrics">

                <div>
                  <span>Total at risk</span>

                  <strong>
                    {money(
                      experiment.totalAtRisk
                    )}
                  </strong>
                </div>

                <div>
                  <span>Eligible revenue</span>

                  <strong>
                    {money(
                      experiment.eligibleRevenue
                    )}
                  </strong>
                </div>

                <div>
                  <span>Overall recovery</span>

                  <strong>
                    {percent(
                      experiment.recoveryRate
                    )}
                  </strong>
                </div>

                <div>
                  <span>Eligible recovery</span>

                  <strong>
                    {percent(
                      experiment.eligibleRecoveryRate
                    )}
                  </strong>
                </div>

                <div>
                  <span>Decision agreement</span>

                  <strong>
                    {percent(
                      experiment.decisionAgreement
                    )}
                  </strong>
                </div>

                <div>
                  <span>Policy violations</span>

                  <strong>
                    {experiment.policyViolations || 0}
                  </strong>
                </div>

              </div>

              {/* ACTION / POLICY SPLIT */}

              <div className="benchmark-columns">

                <div className="benchmark-box">

                  <div className="benchmark-box-header">
                    <span>
                      AI AGENT ACTIONS
                    </span>
                  </div>

                  <div className="distribution-row">
                    <span>RETRY</span>

                    <strong>
                      {experiment.actionSummary?.RETRY || 0}
                    </strong>
                  </div>

                  <div className="distribution-row">
                    <span>REVIEW</span>

                    <strong>
                      {experiment.actionSummary?.REVIEW || 0}
                    </strong>
                  </div>

                  <div className="distribution-row">
                    <span>STOP</span>

                    <strong>
                      {experiment.actionSummary?.STOP || 0}
                    </strong>
                  </div>

                </div>

                <div className="benchmark-box">

                  <div className="benchmark-box-header">
                    <span>
                      POLICY ENGINE
                    </span>
                  </div>

                  <div className="distribution-row">
                    <span>ALLOW</span>

                    <strong>
                      {experiment.policySummary?.ALLOW || 0}
                    </strong>
                  </div>

                  <div className="distribution-row">
                    <span>BLOCK</span>

                    <strong>
                      {experiment.policySummary?.BLOCK || 0}
                    </strong>
                  </div>

                  <div className="distribution-row">
                    <span>STOPPED</span>

                    <strong>
                      {experiment.stoppedActions || 0}
                    </strong>
                  </div>

                </div>

              </div>

              {/* SCENARIO BREAKDOWN */}

              <div className="scenario-results">

                <div className="subsection-heading">

                  <div>

                    <span className="eyebrow">
                      TEST COVERAGE
                    </span>

                    <h3>
                      Scenario breakdown
                    </h3>

                  </div>

                </div>

                <div className="scenario-results-table">

                  {Object.entries(
                    experiment.scenarioSummary || {}
                  ).map(
                    ([
                      scenarioName,
                      data,
                    ]) => (
                      <div
                        className="scenario-result"
                        key={scenarioName}
                      >

                        <div className="scenario-result-main">

                          <strong>
                            {pretty(
                              scenarioName
                            )}
                          </strong>

                          <span>
                            {data.cases} cases
                          </span>

                        </div>

                        <div>
                          <span>
                            Expected
                          </span>

                          <strong>
                            {data.expectedAction}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Allowed
                          </span>

                          <strong>
                            {data.allowed}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Blocked
                          </span>

                          <strong>
                            {data.blocked}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Correct
                          </span>

                          <strong>
                            {data.correctDecisions || 0}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Recovered
                          </span>

                          <strong>
                            {money(
                              data.recoveredAmount
                            )}
                          </strong>
                        </div>

                      </div>
                    )
                  )}

                </div>

              </div>

              <div className="benchmark-footnote">

                <div>

                  <strong>
                    Safety result
                  </strong>

                  <p>
                    {policySafe
                      ? "No policy violations were recorded across the controlled benchmark."
                      : `${experiment.policyViolations} policy violations were recorded.`}
                  </p>

                </div>

                <div>

                  <strong>
                    How to read this
                  </strong>

                  <p>
                    Overall recovery is measured
                    against total synthetic revenue
                    at risk. Eligible recovery measures
                    performance only where the policy
                    engine permitted action.
                  </p>

                </div>

              </div>

            </div>
          )}

        </section>

        {/* =================================================
            PAYMENT MONITOR
        ================================================= */}

        <section className="panel">

          <SectionHeader
            eyebrow="LIVE TRANSACTION DATA"
            title="Payment Monitor"
            description="Real Razorpay test transactions. Synthetic benchmark records are excluded."
          />

          <div className="monitor-toolbar">

            <div className="monitor-summary">

              <span className="status-dot online" />

              {transactions.length} live records

            </div>

            <span className="monitor-note">
              Select a failed payment to open
              Recovery Analysis.
            </span>

          </div>

          <div className="table-wrapper">

            <table>

              <thead>

                <tr>
                  <th>Payment</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Recovery</th>
                  <th />
                </tr>

              </thead>

              <tbody>

                {transactions.length === 0 ? (
                  <tr>

                    <td
                      colSpan="6"
                      className="empty-cell"
                    >

                      <EmptyState
                        title="No live transactions"
                        description="Create a Razorpay test payment above to see it appear here."
                      />

                    </td>

                  </tr>
                ) : (
                  transactions.map(
                    (transaction) => {

                      const paymentId =
                        transaction.razorpayPaymentId ||
                        transaction.razorpayOrderId;

                      return (
                        <tr
                          key={
                            transaction._id
                          }
                          className={
                            selectedTransaction?._id ===
                            transaction._id
                              ? "selected-row"
                              : ""
                          }
                        >

                          <td>

                            <div className="payment-identity">

                              <strong className="mono">
                                {paymentId}
                              </strong>

                              <span>
                                {transaction.customer?.email ||
                                  "Customer payment"}
                              </span>

                            </div>

                          </td>

                          <td>
                            <strong>
                              {money(
                                transaction.amount
                              )}
                            </strong>
                          </td>

                          <td>
                            {pretty(
                              transaction.method ||
                                "Unknown"
                            )}
                          </td>

                          <td>

                            <StatusBadge
                              type={
                                transaction.status
                              }
                            >
                              {pretty(
                                transaction.status
                              )}
                            </StatusBadge>

                          </td>

                          <td>

                            <StatusBadge
                              type={
                                transaction.recoveryStatus ||
                                "NOT_ATTEMPTED"
                              }
                            >
                              {pretty(
                                transaction.recoveryStatus ||
                                  "NOT_ATTEMPTED"
                              )}
                            </StatusBadge>

                          </td>

                          <td className="table-action">

                            {transaction.status ===
                            "failed" ? (
                              <button
                                className="small-btn"
                                onClick={() =>
                                  analyzeTransaction(
                                    transaction
                                  )
                                }
                              >
                                Analyze →
                              </button>
                            ) : (
                              <span className="muted">
                                —
                              </span>
                            )}

                          </td>

                        </tr>
                      );
                    }
                  )
                )}

              </tbody>

            </table>

          </div>

        </section>

        {/* =================================================
            DECISION CENTER
        ================================================= */}

        {selectedTransaction && (
          <section className="panel decision-panel">

            <div className="decision-header">

              <div>

                <div className="eyebrow">
                  AGENT DECISION CENTER
                </div>

                <h2>
                  Recovery Analysis
                </h2>

                <p className="panel-description">
                  Understand the payment, review
                  the AI recommendation, verify the
                  policy decision and execute only
                  when authorized.
                </p>

              </div>

              <button
                className="close-btn"
                onClick={
                  closeDecisionCenter
                }
              >
                Close ×
              </button>

            </div>

            {/* TRANSACTION SUMMARY */}

            <div className="transaction-summary">

              <div>
                <span>PAYMENT</span>

                <strong className="mono">
                  {selectedTransaction.razorpayPaymentId ||
                    selectedTransaction.razorpayOrderId}
                </strong>
              </div>

              <div>
                <span>AMOUNT</span>

                <strong>
                  {money(
                    selectedTransaction.amount
                  )}
                </strong>
              </div>

              <div>
                <span>METHOD</span>

                <strong>
                  {pretty(
                    selectedTransaction.method ||
                      "Unknown"
                  )}
                </strong>
              </div>

              <div>
                <span>FAILURE</span>

                <strong>
                  {pretty(
                    selectedTransaction.failureReason ||
                      "Unknown"
                  )}
                </strong>
              </div>

            </div>

            {/* LOADING */}

            {analysisLoading && (
              <div className="analysis-loading">

                <span className="loading-spinner small" />

                <div>

                  <strong>
                    Running recovery intelligence
                  </strong>

                  <p>
                    Evaluating payment context,
                    recovery potential and safety
                    constraints...
                  </p>

                </div>

              </div>
            )}

            {analysis && (
              <>

                {/* DECISION SUMMARY */}

                <div className="decision-overview">

                  <div className="decision-score">

                    <span>
                      RECOVERY SCORE
                    </span>

                    <strong>
                      {
                        analysis.context
                          ?.recovery
                          ?.score
                      }

                      <small>
                        /100
                      </small>
                    </strong>

                    <div className="score-track">

                      <div
                        style={{
                          width: `${Math.min(
                            Number(
                              analysis.context
                                ?.recovery
                                ?.score || 0
                            ),
                            100
                          )}%`,
                        }}
                      />

                    </div>

                  </div>

                  <div className="decision-stat">

                    <span>
                      RISK LEVEL
                    </span>

                    <strong>
                      {pretty(
                        analysis.context
                          ?.recovery
                          ?.riskLevel
                      )}
                    </strong>

                  </div>

                  <div className="decision-stat">

                    <span>
                      AI CONFIDENCE
                    </span>

                    <strong>
                      {Math.round(
                        (
                          analysis.aiDecision
                            ?.confidence || 0
                        ) * 100
                      )}
                      %
                    </strong>

                  </div>

                </div>

                {/* AI VS POLICY */}

                <div className="decision-flow">

                  {/* AI */}

                  <div className="decision-stage ai-stage">

                    <div className="stage-header">

                      <div className="stage-number">
                        01
                      </div>

                      <div>

                        <span>
                          AI RECOMMENDATION
                        </span>

                        <strong>
                          What does the model suggest?
                        </strong>

                      </div>

                    </div>

                    <div className="ai-action">

                      <span>
                        RECOMMENDED ACTION
                      </span>

                      <strong>
                        {pretty(
                          analysis.aiDecision
                            ?.recommendedAction
                        )}
                      </strong>

                    </div>

                    <div className="explanation-stack">

                      <div>

                        <span>
                          Diagnosis
                        </span>

                        <p>
                          {
                            analysis.aiDecision
                              ?.diagnosis ||
                            "No diagnosis available."
                          }
                        </p>

                      </div>

                      <div>

                        <span>
                          Reasoning
                        </span>

                        <p>
                          {
                            analysis.aiDecision
                              ?.reason ||
                            "No reasoning available."
                          }
                        </p>

                      </div>

                    </div>

                  </div>

                  <div className="decision-connector">

                    ↓

                    <span>
                      POLICY CHECK
                    </span>

                  </div>

                  {/* POLICY */}

                  <div
                    className={`decision-stage policy-stage ${
                      analysis.policy?.allowed
                        ? "policy-allowed"
                        : "policy-blocked"
                    }`}
                  >

                    <div className="stage-header">

                      <div className="stage-number">
                        02
                      </div>

                      <div>

                        <span>
                          POLICY AUTHORIZATION
                        </span>

                        <strong>
                          Is the action financially safe?
                        </strong>

                      </div>

                    </div>

                    <div className="policy-decision">

                      <span>
                        POLICY RESULT
                      </span>

                      <strong>
                        {analysis.policy
                          ?.allowed
                          ? "ALLOW"
                          : "BLOCK"}
                      </strong>

                    </div>

                    <p className="policy-reason">
                      {analysis.policy?.reason}
                    </p>

                    {analysis.policy
                      ?.blockReasons
                      ?.length > 0 && (
                      <div className="block-reasons">

                        <strong>
                          Why this action is blocked
                        </strong>

                        {analysis.policy.blockReasons.map(
                          (
                            reason,
                            index
                          ) => (
                            <div
                              key={index}
                            >
                              <span>×</span>
                              {reason}
                            </div>
                          )
                        )}

                      </div>
                    )}

                  </div>

                </div>

                {/* ACTION */}

                <div className="action-panel">

                  <div>

                    <span className="eyebrow">
                      NEXT ACTION
                    </span>

                    {analysis.policy?.allowed ? (
                      <>
                        <h3>
                          Recovery is authorized
                        </h3>

                        <p>
                          The AI recommendation
                          passed the deterministic
                          policy check. You can now
                          execute the bounded recovery
                          action.
                        </p>
                      </>
                    ) : (
                      <>
                        <h3>
                          Recovery is blocked
                        </h3>

                        <p>
                          The AI recommendation cannot
                          be executed because the
                          deterministic policy engine
                          did not authorize it.
                        </p>
                      </>
                    )}

                  </div>

                  {analysis.policy?.allowed ? (
                    <button
                      className="execute-btn"
                      disabled={
                        executionLoading
                      }
                      onClick={
                        executeRecovery
                      }
                    >
                      {executionLoading
                        ? "Executing Recovery..."
                        : "Execute Recovery →"}
                    </button>
                  ) : (
                    <div className="blocked-banner">

                      <span>×</span>

                      BLOCKED BY POLICY

                    </div>
                  )}

                </div>

              </>
            )}

            {/* =================================================
                EXECUTION RESULT
            ================================================= */}

            {executionResult && (
              <div className="execution-result">

                <div className="execution-result-header">

                  <div>

                    <div className="eyebrow">
                      RECOVERY OUTCOME
                    </div>

                    <h3>
                      {
                        executionResult
                          .execution
                          ?.status
                      }
                    </h3>

                  </div>

                  <StatusBadge type="success">
                    Completed
                  </StatusBadge>

                </div>

                <p>
                  {
                    executionResult
                      .execution
                      ?.message
                  }
                </p>

                <div className="result-grid">

                  <div>

                    <span>
                      Retry Count
                    </span>

                    <strong>
                      {
                        executionResult
                          .transaction
                          ?.retryCount
                      }
                    </strong>

                  </div>

                  <div>

                    <span>
                      Recovered
                    </span>

                    <strong>
                      {money(
                        executionResult
                          .execution
                          ?.recoveredAmount
                      )}
                    </strong>

                  </div>

                  <div>

                    <span>
                      Final Status
                    </span>

                    <strong>
                      {pretty(
                        executionResult
                          .transaction
                          ?.recoveryStatus
                      )}
                    </strong>

                  </div>

                </div>

              </div>
            )}

            {/* =================================================
                TIMELINE
            ================================================= */}

            <div className="timeline-section">

              <div className="timeline-heading">

                <div>

                  <div className="eyebrow">
                    AUDIT TRAIL
                  </div>

                  <h3>
                    Recovery Timeline
                  </h3>

                  <p className="panel-description">
                    Every recovery decision and action
                    is recorded against this payment.
                  </p>

                </div>

                <div className="timeline-count">
                  {timeline.length} events
                </div>

              </div>

              {timelineLoading && (
                <div className="analysis-loading compact">

                  <span className="loading-spinner small" />

                  Loading audit events...

                </div>
              )}

              {!timelineLoading &&
                timeline.length === 0 && (
                  <EmptyState
                    title="No recovery events yet"
                    description="Analysis and recovery activity will appear here as the payment moves through the system."
                  />
                )}

              {!timelineLoading &&
                timeline.length > 0 && (
                  <div className="timeline">

                    {timeline.map(
                      (log, index) => (
                        <div
                          className="timeline-item"
                          key={
                            log._id ||
                            index
                          }
                        >

                          <div className="timeline-marker">
                            {index + 1}
                          </div>

                          <div className="timeline-content">

                            <div className="timeline-top">

                              <div>

                                <strong>
                                  {timelineTitle(
                                    log.eventType ||
                                      log.action
                                  )}
                                </strong>

                                <span>
                                  {log.createdAt
                                    ? new Date(
                                        log.createdAt
                                      ).toLocaleString()
                                    : ""}
                                </span>

                              </div>

                              <StatusBadge>

                                {pretty(
                                  log.decision ||
                                    log.action ||
                                    "RECORDED"
                                )}

                              </StatusBadge>

                            </div>

                            <p>
                              {log.reason ||
                                log.details
                                  ?.message ||
                                "Recovery event recorded."}
                            </p>

                            <div className="timeline-meta">

                              <span>
                                Actor:{" "}
                                <strong>
                                  {log.actor ||
                                    "RECOVERY_AGENT"}
                                </strong>
                              </span>

                              {log.action && (
                                <span>
                                  Action:{" "}
                                  <strong>
                                    {pretty(
                                      log.action
                                    )}
                                  </strong>
                                </span>
                              )}

                            </div>

                          </div>

                        </div>
                      )
                    )}

                  </div>
                )}

            </div>

          </section>
        )}

        {/* =================================================
            FOOTER
        ================================================= */}

        <footer className="app-footer">

          <div>

            <strong>
              REVENUEX
            </strong>

            <span>
              Autonomous AI Revenue Recovery
            </span>

          </div>

          <div>
            AI recommends.
            Policy authorizes.
            Recovery executes.
          </div>

        </footer>

      </main>

    </div>
  );
}

export default App;

