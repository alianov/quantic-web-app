import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getTimeOptions,
  lastBookableDate,
  todayAtRestaurant,
  validateReservationSlot,
} from "./reservationLogic.js";

const NAV_ITEMS = [
  { path: "/", label: "Home" },
  { path: "/menu", label: "Menu" },
  { path: "/reservations", label: "Reservations" },
  { path: "/about", label: "About Us" },
  { path: "/gallery", label: "Gallery" },
];

const MENU = [
  {
    name: "Starters",
    note: "A thoughtful beginning",
    items: [
      {
        name: "Bruschetta",
        description: "Fresh tomatoes, basil, olive oil, and toasted baguette slices",
        price: "$8.50",
      },
      {
        name: "Caesar Salad",
        description: "Crisp romaine with homemade Caesar dressing",
        price: "$9.00",
      },
    ],
  },
  {
    name: "Main Courses",
    note: "The heart of the evening",
    featured: true,
    items: [
      {
        name: "Grilled Salmon",
        description: "Served with lemon butter sauce and seasonal vegetables",
        price: "$22.00",
      },
      {
        name: "Ribeye Steak",
        description: "12 oz prime cut with garlic mashed potatoes",
        price: "$28.00",
      },
      {
        name: "Vegetable Risotto",
        description: "Creamy Arborio rice with wild mushrooms",
        price: "$18.00",
      },
    ],
  },
  {
    name: "Desserts",
    note: "A sweet final course",
    items: [
      {
        name: "Tiramisu",
        description: "Classic Italian dessert with mascarpone",
        price: "$7.50",
      },
      {
        name: "Cheesecake",
        description: "Creamy cheesecake with berry compote",
        price: "$7.00",
      },
    ],
  },
  {
    name: "Beverages",
    note: "Selected for the table",
    items: [
      {
        name: "Red Wine (Glass)",
        description: "A selection of Italian reds",
        price: "$10.00",
      },
      {
        name: "White Wine (Glass)",
        description: "Crisp and refreshing",
        price: "$9.00",
      },
      {
        name: "Craft Beer",
        description: "Local artisan brews",
        price: "$6.00",
      },
      {
        name: "Espresso",
        description: "Strong and aromatic",
        price: "$3.00",
      },
    ],
  },
];

const GALLERY_IMAGES = [
  {
    src: "/images/home-cafe-fausse.webp",
    alt: "The grand Café Fausse dining room prepared for dinner",
    title: "An evening at Café Fausse",
    category: "Ambiance",
  },
  {
    src: "/images/gallery-ribeye-steak.webp",
    alt: "Ribeye steak served with roasted vegetables",
    title: "Ribeye steak",
    category: "From the menu",
  },
  {
    src: "/images/gallery-cafe-interior.webp",
    alt: "The elegant Café Fausse dining room with chandeliers",
    title: "The dining room",
    category: "Interior",
  },
  {
    src: "/images/gallery-special-event.webp",
    alt: "Guests gathered around a long table for a special event",
    title: "Celebrations together",
    category: "Special events",
  },
];

const PAGE_TITLES = {
  "/": "Café Fausse | Fine Dining in Washington, DC",
  "/menu": "Menu | Café Fausse",
  "/reservations": "Reservations | Café Fausse",
  "/about": "About Us | Café Fausse",
  "/gallery": "Gallery | Café Fausse",
};

function normalizePath(path) {
  if (path === "/") return path;
  return path.replace(/\/+$/, "") || "/";
}

function Link({ to, onNavigate, children, ...props }) {
  function handleClick(event) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onNavigate(to);
  }

  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

async function requestJson(url, options) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("We could not reach the restaurant. Please try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Something went wrong. Please try again.");
  }

  return data;
}

function formatTime(time) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`2000-01-01T${time.slice(0, 5)}:00Z`));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function Header({ path, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  function navigate(to) {
    setMenuOpen(false);
    onNavigate(to);
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="wordmark" to="/" onNavigate={navigate} aria-label="Café Fausse home">
          <span className="wordmark-mark" aria-hidden="true">CF</span>
          <span>
            <strong>Café Fausse</strong>
            <small>Washington, DC</small>
          </span>
        </Link>

        <button
          className="nav-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>

        <nav
          id="primary-navigation"
          className={`site-nav${menuOpen ? " is-open" : ""}`}
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onNavigate={navigate}
              aria-current={path === item.path ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <Link className="nav-reserve" to="/reservations" onNavigate={navigate}>
            Book a table
          </Link>
        </nav>
      </div>
    </header>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function subscribe(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const data = await requestJson("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus("success");
      setMessage(data.message || "You are on the list. We look forward to writing to you.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  return (
    <form className="newsletter-form" onSubmit={subscribe}>
      <label htmlFor="newsletter-email">Email address</label>
      <div className="newsletter-row">
        <input
          id="newsletter-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          maxLength="254"
          required
        />
        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Joining..." : "Join"}
        </button>
      </div>
      <p
        className={`form-note${status === "error" ? " form-note-error" : ""}`}
        role={status === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {message || "Seasonal menus, special dinners, and news from our kitchen."}
      </p>
    </form>
  );
}

function Footer({ onNavigate }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <p className="eyebrow">Stay for another course</p>
          <h2>Notes from Café Fausse</h2>
          <NewsletterForm />
        </div>

        <div className="footer-details">
          <div>
            <h3>Visit</h3>
            <address>
              1234 Culinary Ave, Suite 100<br />
              Washington, DC 20002<br />
              <a href="tel:+12025554567">(202) 555-4567</a>
            </address>
          </div>
          <div>
            <h3>Hours</h3>
            <p>
              Monday-Saturday<br />5:00 PM-11:00 PM
            </p>
            <p>
              Sunday<br />5:00 PM-9:00 PM
            </p>
          </div>
          <div>
            <h3>Explore</h3>
            <ul>
              {NAV_ITEMS.slice(1).map((item) => (
                <li key={item.path}>
                  <Link to={item.path} onNavigate={onNavigate}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Café Fausse</p>
        <p>Italian tradition, made for today.</p>
      </div>
    </footer>
  );
}

function HomePage({ onNavigate }) {
  return (
    <main id="main-content" tabIndex="-1">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Fine dining in Washington, DC</p>
          <h1>Every evening should feel <em>unforgettable.</em></h1>
          <p className="hero-lede">
            Traditional Italian flavors meet modern culinary ideas in a warm room made for
            conversation, celebration, and one more course.
          </p>
          <div className="button-row">
            <Link className="button button-primary" to="/reservations" onNavigate={onNavigate}>
              Reserve your table
            </Link>
            <Link className="button button-text" to="/menu" onNavigate={onNavigate}>
              Explore the menu <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <figure className="hero-image-wrap">
          <img
            className="hero-image"
            src="/images/home-cafe-fausse.webp"
            alt="The grand Café Fausse dining room prepared for dinner"
            fetchPriority="high"
          />
          <figcaption>
            <span>Dinner nightly</span>
            <strong>From 5:00 PM</strong>
          </figcaption>
        </figure>
      </section>

      <section className="visit-strip" aria-label="Restaurant details">
        <div>
          <span className="detail-number">01</span>
          <p><strong>Find us</strong>1234 Culinary Ave, Suite 100<br />Washington, DC 20002</p>
        </div>
        <div>
          <span className="detail-number">02</span>
          <p><strong>Join us</strong>Monday-Saturday, 5:00 PM-11:00 PM<br />Sunday, 5:00 PM-9:00 PM</p>
        </div>
        <div>
          <span className="detail-number">03</span>
          <p><strong>Call us</strong><a href="tel:+12025554567">(202) 555-4567</a></p>
        </div>
      </section>

      <section className="split-section container">
        <div className="section-heading">
          <p className="eyebrow">Our table</p>
          <h2>Italian roots.<br />A modern point of view.</h2>
        </div>
        <div className="section-copy">
          <p className="drop-cap">
            Founded in 2010 by Chef Antonio Rossi and restaurateur Maria Lopez, Café Fausse
            brings careful cooking and warm service together.
          </p>
          <p>
            We choose excellent ingredients, work with local producers, and give familiar
            Italian dishes a fresh sense of place.
          </p>
          <Link className="text-link" to="/about" onNavigate={onNavigate}>
            Read our story <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="feature-section">
        <div className="container feature-grid">
          <div className="feature-image">
            <img
              src="/images/gallery-ribeye-steak.webp"
              alt="Ribeye steak served with roasted vegetables"
              loading="lazy"
            />
          </div>
          <div className="feature-copy">
            <p className="eyebrow">From the kitchen</p>
            <h2>Simple ingredients.<br />Careful hands.</h2>
            <p>
              Our menu moves from crisp bruschetta to grilled salmon, risotto, and classic
              Italian desserts. Each plate is clear, generous, and made for the moment.
            </p>
            <Link className="button button-light" to="/menu" onNavigate={onNavigate}>
              View our menu
            </Link>
          </div>
        </div>
      </section>

      <section className="quote-section container">
        <p className="quote-mark" aria-hidden="true">“</p>
        <blockquote>
          <p>Exceptional ambiance and unforgettable flavors.</p>
          <cite>Gourmet Review</cite>
        </blockquote>
      </section>
    </main>
  );
}

function MenuPage({ onNavigate }) {
  return (
    <main id="main-content" tabIndex="-1">
      <section className="page-hero menu-hero">
        <div className="container page-hero-inner">
          <p className="eyebrow">Dinner at Café Fausse</p>
          <h1>The menu</h1>
          <p>
            Italian favorites shaped by the season, served with a modern spirit and a
            generous welcome.
          </p>
        </div>
      </section>

      <section className="menu-section container" aria-labelledby="menu-heading">
        <div className="menu-intro">
          <p id="menu-heading">Our dinner menu</p>
          <p>Prices are shown in US dollars.</p>
        </div>
        <div className="menu-grid">
          {MENU.map((category) => (
            <section
              className={`menu-category${category.featured ? " menu-category-featured" : ""}`}
              key={category.name}
            >
              <header>
                <p>{category.note}</p>
                <h2>{category.name}</h2>
              </header>
              <ul>
                {category.items.map((item) => (
                  <li key={item.name}>
                    <div className="menu-item-heading">
                      <h3>{item.name}</h3>
                      <span aria-hidden="true" />
                      <strong>{item.price}</strong>
                    </div>
                    <p>{item.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="menu-cta container">
        <div>
          <p className="eyebrow">Your table is waiting</p>
          <h2>Make an evening of it.</h2>
        </div>
        <Link className="button button-primary" to="/reservations" onNavigate={onNavigate}>
          Reserve a table
        </Link>
      </section>
    </main>
  );
}

const EMPTY_RESERVATION = {
  date: "",
  time: "",
  guestCount: "2",
  name: "",
  email: "",
  phone: "",
};

function ReservationsPage() {
  const [form, setForm] = useState(EMPTY_RESERVATION);
  const [availability, setAvailability] = useState({ status: "idle", slots: [] });
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [formMessage, setFormMessage] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    if (!form.date) {
      setAvailability({ status: "idle", slots: [] });
      return undefined;
    }

    const controller = new AbortController();
    setAvailability({ status: "loading", slots: [] });

    requestJson(`/api/availability?date=${encodeURIComponent(form.date)}`, {
      signal: controller.signal,
    })
      .then((data) => {
        const slots = (data.slots || []).map((slot) => ({
          time: String(slot.time).slice(0, 5),
          availableTables: Number(slot.available_tables),
        }));
        setAvailability({ status: "success", slots });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setAvailability({ status: "error", slots: [], message: error.message });
        }
      });

    return () => controller.abort();
  }, [form.date, availabilityVersion]);

  const timeOptions = useMemo(() => {
    if (availability.status !== "success") return [];
    return availability.slots
      .filter((slot) => getTimeOptions(form.date).some((option) => option.value === slot.time))
      .map((slot) => ({
        ...slot,
        isPast: validateReservationSlot(form.date, slot.time) === "Choose a future date and time.",
      }));
  }, [availability, form.date]);

  function updateField(event) {
    const { name, value } = event.target;
    setConfirmation(null);
    setFormMessage("");
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "date" ? { time: "" } : {}),
    }));
  }

  async function submitReservation(event) {
    event.preventDefault();
    const slotError = validateReservationSlot(form.date, form.time);
    if (slotError) {
      setSubmitStatus("error");
      setFormMessage(slotError);
      return;
    }

    setSubmitStatus("loading");
    setFormMessage("");
    setConfirmation(null);

    try {
      const data = await requestJson("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          date: form.date,
          time: form.time,
          guest_count: Number(form.guestCount),
        }),
      });
      setSubmitStatus("success");
      setConfirmation({
        message: data.message || "Your table is confirmed.",
        reservation: data.reservation || {},
        requested: { ...form },
      });
      setForm(EMPTY_RESERVATION);
    } catch (error) {
      setSubmitStatus("error");
      setFormMessage(error.message);
      setAvailabilityVersion((version) => version + 1);
    }
  }

  return (
    <main id="main-content" tabIndex="-1">
      <section className="page-hero reservation-hero">
        <div className="container page-hero-inner">
          <p className="eyebrow">Reservations</p>
          <h1>Come dine with us.</h1>
          <p>Choose your evening and we will take care of the table.</p>
        </div>
      </section>

      <section className="reservation-section container">
        <div className="reservation-form-card">
          <div className="form-heading">
            <p className="eyebrow">Book your table</p>
            <h2>Reservation details</h2>
            <p>All fields are required unless marked optional.</p>
          </div>

          {confirmation && (
            <div className="confirmation" role="status" aria-live="polite">
              <span className="confirmation-mark" aria-hidden="true">✓</span>
              <div>
                <p className="eyebrow">Reservation confirmed</p>
                <h3>{confirmation.message}</h3>
                <p>
                  {formatDate(confirmation.reservation.date || confirmation.requested.date)} at{" "}
                  {formatTime(confirmation.reservation.time || confirmation.requested.time)} for{" "}
                  {confirmation.reservation.guest_count || confirmation.requested.guestCount} guests.
                </p>
                {confirmation.reservation.table_number && (
                  <p className="table-number">
                    Your table: <strong>{confirmation.reservation.table_number}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          <form className="reservation-form" onSubmit={submitReservation}>
            <fieldset>
              <legend>Your evening</legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="reservation-date">Date</label>
                  <input
                    id="reservation-date"
                    name="date"
                    type="date"
                    min={todayAtRestaurant()}
                    max={lastBookableDate()}
                    value={form.date}
                    onChange={updateField}
                    required
                  />
                  <small>Bookings open 90 days ahead.</small>
                </div>
                <div className="field">
                  <label htmlFor="reservation-time">Time</label>
                  <select
                    id="reservation-time"
                    name="time"
                    value={form.time}
                    onChange={updateField}
                    disabled={!form.date || availability.status !== "success"}
                    required
                  >
                    <option value="">
                      {!form.date
                        ? "Choose a date first"
                        : availability.status === "loading"
                          ? "Checking tables..."
                          : "Choose a time"}
                    </option>
                    {timeOptions.map((slot) => (
                      <option
                        key={slot.time}
                        value={slot.time}
                        disabled={slot.availableTables < 1 || slot.isPast}
                      >
                        {formatTime(slot.time)}
                        {slot.isPast
                          ? " - Time passed"
                          : slot.availableTables < 1
                            ? " - Fully booked"
                            : ` - ${slot.availableTables} tables`}
                      </option>
                    ))}
                  </select>
                  {availability.status === "error" && (
                    <p className="field-error" role="alert">
                      {availability.message}{" "}
                      <button type="button" onClick={() => setAvailabilityVersion((value) => value + 1)}>
                        Try again
                      </button>
                    </p>
                  )}
                  {availability.status === "success" && timeOptions.length === 0 && (
                    <p className="field-error" role="status">No seatings are available on this date.</p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="reservation-guests">Number of guests</label>
                  <input
                    id="reservation-guests"
                    name="guestCount"
                    type="number"
                    min="1"
                    max="12"
                    value={form.guestCount}
                    onChange={updateField}
                    inputMode="numeric"
                    required
                  />
                  <small>For parties of 13 or more, please call us.</small>
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Your details</legend>
              <div className="form-grid">
                <div className="field field-wide">
                  <label htmlFor="reservation-name">Customer name</label>
                  <input
                    id="reservation-name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={updateField}
                    autoComplete="name"
                    maxLength="100"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="reservation-email">Email address</label>
                  <input
                    id="reservation-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={updateField}
                    autoComplete="email"
                    maxLength="254"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="reservation-phone">Phone number <span>(optional)</span></label>
                  <input
                    id="reservation-phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={updateField}
                    autoComplete="tel"
                    maxLength="25"
                  />
                </div>
              </div>
            </fieldset>

            {formMessage && (
              <p className="form-alert" role="alert">{formMessage}</p>
            )}

            <button className="button button-primary submit-button" type="submit" disabled={submitStatus === "loading"}>
              {submitStatus === "loading" ? "Reserving your table..." : "Complete reservation"}
            </button>
            <p className="timezone-note">All reservation times are shown in Washington, DC time.</p>
          </form>
        </div>

        <aside className="reservation-aside" aria-label="Before your visit">
          <img
            src="/images/gallery-cafe-interior.webp"
            alt="The elegant Café Fausse dining room with chandeliers"
            loading="lazy"
          />
          <div className="aside-copy">
            <p className="eyebrow">Good to know</p>
            <h2>A relaxed evening awaits.</h2>
            <ul>
              <li><span>01</span>Reservations are available every 30 minutes.</li>
              <li><span>02</span>Each table is reserved for two hours.</li>
              <li><span>03</span>We welcome parties of up to 12 online.</li>
            </ul>
            <p>Need help? Call <a href="tel:+12025554567">(202) 555-4567</a>.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function AboutPage({ onNavigate }) {
  return (
    <main id="main-content" tabIndex="-1">
      <section className="page-hero about-hero">
        <div className="container page-hero-inner">
          <p className="eyebrow">Our story</p>
          <h1>Tradition, with room to grow.</h1>
          <p>A shared belief in excellent food, thoughtful service, and memorable evenings.</p>
        </div>
      </section>

      <section className="story-section container">
        <div className="story-image">
          <img
            src="/images/home-cafe-fausse.webp"
            alt="The grand Café Fausse dining room prepared for guests"
            loading="lazy"
          />
          <p>Washington, DC <span>Est. 2010</span></p>
        </div>
        <div className="story-copy">
          <p className="eyebrow">About Café Fausse</p>
          <h2>Two founders.<br />One clear idea.</h2>
          <p className="story-lede">
            Founded in 2010 by Chef Antonio Rossi and restaurateur Maria Lopez, Café Fausse
            blends traditional Italian flavors with modern culinary innovation.
          </p>
          <p>
            Our mission is to provide an unforgettable dining experience that reflects both
            quality and creativity. That promise guides every plate, every welcome, and every
            detail in the room.
          </p>
          <p>
            We build our menu around excellent food and locally sourced ingredients. We value
            the people who grow, prepare, and serve them, and we believe care can be tasted.
          </p>
        </div>
      </section>

      <section className="founders-section">
        <div className="container">
          <div className="section-heading centered-heading">
            <p className="eyebrow">The founders</p>
            <h2>Kitchen craft meets genuine hospitality.</h2>
          </div>
          <div className="founder-grid">
            <article>
              <span className="founder-initials" aria-hidden="true">AR</span>
              <p className="founder-role">Chef &amp; co-founder</p>
              <h3>Antonio Rossi</h3>
              <p>
                Antonio leads the kitchen with respect for Italian cooking and an open mind.
                His food keeps familiar flavors at its center while giving every plate a clean,
                modern finish.
              </p>
            </article>
            <article>
              <span className="founder-initials" aria-hidden="true">ML</span>
              <p className="founder-role">Restaurateur &amp; co-founder</p>
              <h3>Maria Lopez</h3>
              <p>
                Maria shapes the dining room and the guest experience. Her approach is simple:
                welcome people warmly, notice the small details, and make every table feel at
                home.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="values-section container">
        <div>
          <p className="eyebrow">What matters to us</p>
          <h2>Quality. Creativity. Care.</h2>
        </div>
        <div className="value-grid">
          <article>
            <span>01</span>
            <h3>Excellent ingredients</h3>
            <p>We begin with fresh, high-quality produce and strong local relationships.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Creative cooking</h3>
            <p>We protect the spirit of Italian classics while allowing new ideas to enter.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Memorable service</h3>
            <p>Good hospitality is warm, observant, and present without ever feeling formal.</p>
          </article>
        </div>
        <Link className="button button-primary" to="/reservations" onNavigate={onNavigate}>
          Join us for dinner
        </Link>
      </section>
    </main>
  );
}

function GalleryPage() {
  const [activeIndex, setActiveIndex] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (activeIndex !== null && dialog && !dialog.open) dialog.showModal();
    if (activeIndex === null && dialog?.open) dialog.close();
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex === null) return undefined;

    // Arrow keys let keyboard users move through the open gallery without closing it.
    function browse(event) {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft") {
        setActiveIndex((index) => (index - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length);
      }
      if (event.key === "ArrowRight") {
        setActiveIndex((index) => (index + 1) % GALLERY_IMAGES.length);
      }
    }

    window.addEventListener("keydown", browse);
    return () => window.removeEventListener("keydown", browse);
  }, [activeIndex]);

  const activeImage = activeIndex === null ? null : GALLERY_IMAGES[activeIndex];

  return (
    <main id="main-content" tabIndex="-1">
      <section className="page-hero gallery-hero">
        <div className="container page-hero-inner">
          <p className="eyebrow">Gallery</p>
          <h1>A seat at our table.</h1>
          <p>A look inside the dining room, at the food, and at the evenings we share.</p>
        </div>
      </section>

      <section className="gallery-section container" aria-labelledby="gallery-heading">
        <div className="section-heading gallery-heading">
          <p className="eyebrow">In the restaurant</p>
          <h2 id="gallery-heading">Moments from Café Fausse</h2>
          <p>Select an image to view it larger.</p>
        </div>
        <div className="gallery-grid">
          {GALLERY_IMAGES.map((image, index) => (
            <button
              className={`gallery-item gallery-item-${index + 1}`}
              type="button"
              key={image.src}
              onClick={() => setActiveIndex(index)}
              aria-label={`Open ${image.title} image`}
            >
              <img src={image.src} alt={image.alt} loading="lazy" />
              <span>
                <small>{image.category}</small>
                <strong>{image.title}</strong>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="recognition-section">
        <div className="container recognition-grid">
          <div>
            <p className="eyebrow">Recognition</p>
            <h2>Honored by our community.</h2>
            <p>
              Awards are meaningful because they recognize the work of our full team, from
              the first kitchen preparation to the final goodbye.
            </p>
          </div>
          <ol className="award-list">
            <li><span>2022</span><strong>Culinary Excellence Award</strong></li>
            <li><span>2023</span><strong>Restaurant of the Year</strong></li>
            <li><span>2023</span><strong>Best Fine Dining Experience</strong><small>Foodie Magazine</small></li>
          </ol>
        </div>
      </section>

      <section className="reviews-section container">
        <p className="eyebrow">Guest notes</p>
        <div className="review-grid">
          <blockquote>
            <p>“Exceptional ambiance and unforgettable flavors.”</p>
            <cite>Gourmet Review</cite>
          </blockquote>
          <blockquote>
            <p>“A must-visit restaurant for food enthusiasts.”</p>
            <cite>The Daily Bite</cite>
          </blockquote>
        </div>
      </section>

      <dialog
        className="lightbox"
        ref={dialogRef}
        onClose={() => setActiveIndex(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        aria-labelledby="lightbox-title"
      >
        {activeImage && (
          <div className="lightbox-inner">
            <button
              className="lightbox-close"
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close image"
            >
              ×
            </button>
            <button
              className="lightbox-arrow lightbox-previous"
              type="button"
              onClick={() => setActiveIndex((activeIndex - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length)}
              aria-label="Previous image"
            >
              ←
            </button>
            <img src={activeImage.src} alt={activeImage.alt} />
            <button
              className="lightbox-arrow lightbox-next"
              type="button"
              onClick={() => setActiveIndex((activeIndex + 1) % GALLERY_IMAGES.length)}
              aria-label="Next image"
            >
              →
            </button>
            <p id="lightbox-title">
              <small>{activeImage.category}</small>
              <strong>{activeImage.title}</strong>
            </p>
          </div>
        )}
      </dialog>
    </main>
  );
}

function NotFoundPage({ onNavigate }) {
  return (
    <main id="main-content" className="not-found" tabIndex="-1">
      <p className="eyebrow">404</p>
      <h1>This table is not on our floor plan.</h1>
      <p>The page you requested could not be found.</p>
      <Link className="button button-primary" to="/" onNavigate={onNavigate}>Return home</Link>
    </main>
  );
}

const ROUTES = {
  "/": HomePage,
  "/menu": MenuPage,
  "/reservations": ReservationsPage,
  "/about": AboutPage,
  "/gallery": GalleryPage,
};

export default function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const firstRoute = useRef(true);

  useEffect(() => {
    function followBrowserHistory() {
      setPath(normalizePath(window.location.pathname));
    }

    window.addEventListener("popstate", followBrowserHistory);
    return () => window.removeEventListener("popstate", followBrowserHistory);
  }, []);

  useEffect(() => {
    document.title = PAGE_TITLES[path] || "Page not found | Café Fausse";
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }

    // Focus the new page after client-side navigation so screen readers announce it.
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  }, [path]);

  const navigate = useCallback((to) => {
    const nextPath = normalizePath(to);
    if (nextPath === normalizePath(window.location.pathname)) return;
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }, []);

  const Page = ROUTES[path] || NotFoundPage;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header path={path} onNavigate={navigate} />
      <Page onNavigate={navigate} />
      <Footer onNavigate={navigate} />
    </>
  );
}
