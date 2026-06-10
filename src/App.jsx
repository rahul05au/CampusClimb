import React, { useState, useEffect } from 'react';
import heroImg from './assets/hero.png';
import FAQSection from './components/FAQSection';
import './App.css';

// Custom inline SVG icons for premium styling
const MapIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
);
const CompassIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
);
const ToolsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
);
const TruckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
);

const BUILDINGS = [
  {
    id: 'lbr',
    name: 'Central Library',
    code: 'LBR',
    type: 'Academic',
    status: 'Open',
    time: '08:00 AM - 10:00 PM',
    capacity: '42%',
    description: 'The academic heart of the campus. Features 4 floors of study zones, computer labs, an extensive archival system, and the newly built 24/7 reading lounge.',
    features: ['High-speed Wi-Fi', 'Silent Study Zones', 'Cafe Corner', 'Printing Labs'],
    busyHours: 65,
    popularSpots: 'Rooftop Study Terrace, Archives room',
    location: 'North Quadrant',
    x: 150, y: 120, w: 100, h: 80
  },
  {
    id: 'adm',
    name: 'Administrative Hub',
    code: 'ADM',
    type: 'Administration',
    status: 'Open',
    time: '09:00 AM - 05:00 PM',
    capacity: '18%',
    description: 'Main headquarters housing the registrar office, financial services, admissions bureau, student council chamber, and executive boardrooms.',
    features: ['Student Helpdesk', 'Admissions Office', 'ATM Center', 'Visitor Lobby'],
    busyHours: 30,
    popularSpots: 'Chancellor\'s Court yard',
    location: 'Central Plaza',
    x: 350, y: 80, w: 120, h: 70
  },
  {
    id: 'lab',
    name: 'Science & Innovation Labs',
    code: 'LAB',
    type: 'Academic',
    status: 'Open',
    time: '08:00 AM - 08:00 PM',
    capacity: '58%',
    description: 'State-of-the-art facility featuring high-tech laboratories for Biotechnology, AI Research, Robotics, and Advanced Chemistry.',
    features: ['Research Suites', 'VR Lab', '3D Printing Hub', 'Cleanroom Facility'],
    busyHours: 80,
    popularSpots: 'AI Robotics Showroom',
    location: 'East Wing',
    x: 550, y: 150, w: 110, h: 90
  },
  {
    id: 'caf',
    name: 'Central Pavilion & Cafe',
    code: 'CAF',
    type: 'Social',
    status: 'Open',
    time: '07:30 AM - 09:00 PM',
    capacity: '85%',
    description: 'The main student dining common offering multi-cuisine food stalls, outdoor seating, green canopy gardens, and a stage for live acoustic sessions.',
    features: ['Organic Dining', 'Outdoor Deck', 'Lounge Seating', 'Live Stage'],
    busyHours: 95,
    popularSpots: 'Canopy Garden Deck',
    location: 'Central Plaza',
    x: 300, y: 250, w: 90, h: 90
  },
  {
    id: 'spt',
    name: 'Sports Complex & Gym',
    code: 'SPT',
    type: 'Recreation',
    status: 'Open',
    time: '06:00 AM - 10:00 PM',
    capacity: '35%',
    description: 'Olympic-sized indoor swimming pool, fitness centers, climbing walls, basketball courts, and the campus athletics medicine office.',
    features: ['Cardio Zone', 'Climbing Wall', 'Indoor Pool', 'Juice Bar'],
    busyHours: 45,
    popularSpots: 'Climbing Wall Arena',
    location: 'West Sector',
    x: 80, y: 280, w: 110, h: 90
  },
  {
    id: 'hst',
    name: 'Greenwood Hostels',
    code: 'HST',
    type: 'Residential',
    status: 'Open',
    time: '24/7 Accessible',
    capacity: '70%',
    description: 'Eco-friendly student residential complex featuring solar power grid, laundry services, study lounges, and common game rooms.',
    features: ['Laundry', 'Game Rooms', 'Bicycle Hub', '24/7 Security'],
    busyHours: 20,
    popularSpots: 'Greenwood Lawn & Grill',
    location: 'South Area',
    x: 220, y: 380, w: 140, h: 70
  },
  {
    id: 'inh',
    name: 'Innovation & Incubation Hub',
    code: 'INH',
    type: 'Research',
    status: 'Open',
    time: '08:00 AM - 11:00 PM',
    capacity: '25%',
    description: 'Collaborative co-working space hosting university startups, hackathons, guest industrial seminars, and venture mentoring sessions.',
    features: ['Co-working Desks', 'Meeting Rooms', 'High-Speed Fiber', 'Coffee Bar'],
    busyHours: 50,
    popularSpots: 'Pitch Deck Lounge',
    location: 'East Wing',
    x: 520, y: 310, w: 120, h: 80
  }
];

const TOUR_STEPS = [
  {
    title: 'Start at Central Plaza',
    description: 'Begin your campus journey here. It connects the Admin Hub, the Central Cafe, and the Library. You will find lush lawns and the iconic Campus Landmark Clock Tower.',
    landmarkName: 'Clock Tower & Plaza',
    image: heroImg
  },
  {
    title: 'Explore the Central Library',
    description: 'Walk inside the Library. Go to the third floor for the Rooftop Study Terrace, offering panoramic views of the entire valley campus. Quiet, breezy, and great for focused writing.',
    landmarkName: 'Rooftop Study Terrace',
    image: heroImg
  },
  {
    title: 'Visit the Innovation Hub',
    description: 'This is where student startups are born. Head to the Pitch Deck Lounge to check out student inventions on display, or grab a free cold brew at the startup coffee stand.',
    landmarkName: 'Venture Pitch Deck',
    image: heroImg
  },
  {
    title: 'Relax at Canopy Pavilion',
    description: 'Finish your tour at the Cafeteria. Grab some local organic juice, relax on the outdoor deck under the canopy trees, and watch the college musical bands perform live.',
    landmarkName: 'Pavilion Canopy Gardens',
    image: heroImg
  }
];

const UTILITIES = [
  { id: 1, name: 'Water station - Library L1', type: 'water', distance: '1 min walk', desc: 'Reverse osmosis filtered cold water dispenser.', locationHint: 'Near the elevator lobby, 1st Floor' },
  { id: 2, name: 'Campus High-Speed Wi-Fi Zone', type: 'wifi', distance: '0 min walk', desc: 'Secure enterprise 1 Gbps fiber internet.', locationHint: 'Available across all plaza lawns & cafes' },
  { id: 3, name: 'Admin Block Restrooms', type: 'restroom', distance: '2 mins walk', desc: 'All-gender accessible washrooms with baby care table.', locationHint: 'Right side of the ground floor lobby' },
  { id: 4, name: 'Silent Study Pods', type: 'study', distance: '3 mins walk', desc: 'Soundproof single-occupancy glass rooms.', locationHint: 'Library Floor 2 & Innovation Hub L1' },
  { id: 5, name: 'Main Security Booth', type: 'security', distance: '4 mins walk', desc: 'Emergency response, lost & found, shuttle passes.', locationHint: 'Main Entrance Archway Gate 1' },
  { id: 6, name: 'Water station - Cafeteria', type: 'water', distance: '1 min walk', desc: 'Dispenser with reusable bottle refilling sensor.', locationHint: 'Next to the organic food corner' },
  { id: 7, name: 'Sports Gym Lockers & Showers', type: 'restroom', distance: '5 mins walk', desc: 'Dry changing lockers and hot shower booths.', locationHint: 'Ground level, Sports Complex' },
  { id: 8, name: 'First Aid Emergency Room', type: 'security', distance: '3 mins walk', desc: 'On-duty nurse, basic medical supplies, and stretcher.', locationHint: 'Admin Hub East Wing, Room 104' }
];

const EVENTS = [
  { id: 1, name: 'Global Tech & AI Hackathon', time: 'Today, 10:00 AM - 06:00 PM', type: 'Technical', location: 'Innovation Hub L1', status: 'Live' },
  { id: 2, name: 'Acoustic Guitar Evening', time: 'Today, 05:30 PM - 07:30 PM', type: 'Cultural', location: 'Central Pavilion Stage', status: 'Upcoming' },
  { id: 3, name: 'Varsity Basketball Finals', time: 'Tomorrow, 04:00 PM', type: 'Sports', location: 'Outdoor Courts, Sports Complex', status: 'Upcoming' },
  { id: 4, name: 'Graduate Career Fair', time: 'June 8, 09:00 AM', type: 'Technical', location: 'Admin Hub Conference Hall', status: 'Registering' }
];

const SHUTTLE_ROUTES = {
  inner: {
    name: 'Inner Loop (Academic)',
    stops: ['Admin Hub', 'Library', 'Pavilion', 'Labs'],
    positions: [20, 40, 60, 80]
  },
  outer: {
    name: 'Outer Loop (Residential)',
    stops: ['Main Gate', 'Hostels', 'Sports Complex', 'Pavilion'],
    positions: [10, 35, 65, 90]
  },
  express: {
    name: 'Express Line (Main to Labs)',
    stops: ['Main Gate', 'Library', 'Labs'],
    positions: [15, 50, 85]
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [selectedBuilding, setSelectedBuilding] = useState(BUILDINGS[0]);
  const [mapCategoryFilter, setMapCategoryFilter] = useState('all');
  const [tourStep, setTourStep] = useState(0);
  const [utilityFilter, setUtilityFilter] = useState('all');
  const [utilitySearch, setUtilitySearch] = useState('');
  
  // Transit & Events states
  const [shuttleRouteKey, setShuttleRouteKey] = useState('inner');
  const [shuttleCountdown, setShuttleCountdown] = useState(8);
  const [selectedEventForBooking, setSelectedEventForBooking] = useState(null);
  const [bookingForm, setBookingForm] = useState({ name: '', studentId: '', dept: 'Computer Science' });
  const [bookedTicket, setBookedTicket] = useState(null);

  // SOS States
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [sosAlertActive, setSosAlertActive] = useState(false);


  // Building Reviews state
  const [buildingReviews, setBuildingReviews] = useState({
    lbr: [
      { name: 'Aarav M.', rating: 5, text: 'Rooftop Study Terrace is extremely peaceful. Wi-Fi signal is excellent.' },
      { name: 'Sneha K.', rating: 4, text: 'Very crowded during exam hours, but the 24/7 lounge is a life saver.' }
    ],
    caf: [
      { name: 'Kabir S.', rating: 5, text: 'The organic juice corner is the best. Highly recommended.' },
      { name: 'Diya P.', rating: 3, text: 'Lunch hours are very crowded, hard to find a table.' }
    ],
    lab: [
      { name: 'Rohan G.', rating: 5, text: 'Biotech lab equipment is world-class. Great research support.' }
    ],
    adm: [
      { name: 'Vikram A.', rating: 4, text: 'Admissions helpline was helpful, though lines were long.' }
    ],
    spt: [
      { name: 'Neha R.', rating: 5, text: 'The climbing wall is amazing. Safe instructors.' }
    ],
    hst: [
      { name: 'Aman C.', rating: 4, text: 'Spacious study rooms and clean lawn.' }
    ],
    inh: [
      { name: 'Tanya J.', rating: 5, text: 'Perfect place for coding sprint hackathons.' }
    ]
  });

  const [newReview, setNewReview] = useState({ name: '', rating: 5, text: '' });

  const handleReviewSubmit = (e) => {
    e.preventDefault();
    if (!newReview.name || !newReview.text) return;
    const bId = selectedBuilding.id;
    const currentReviews = buildingReviews[bId] || [];
    setBuildingReviews({
      ...buildingReviews,
      [bId]: [...currentReviews, { name: newReview.name, rating: Number(newReview.rating), text: newReview.text }]
    });
    setNewReview({ name: '', rating: 5, text: '' });
  };


  // Shuttle countdown simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setShuttleCountdown(prev => (prev <= 1 ? 10 : prev - 1));
    }, 60000); 
    return () => clearInterval(interval);
  }, []);

  const filteredUtilities = UTILITIES.filter(item => {
    const matchesFilter = utilityFilter === 'all' || item.type === utilityFilter;
    const matchesSearch = item.name.toLowerCase().includes(utilitySearch.toLowerCase()) || 
                          item.desc.toLowerCase().includes(utilitySearch.toLowerCase()) ||
                          item.locationHint.toLowerCase().includes(utilitySearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleBookingSubmit = (e) => {
    e.preventDefault();
    if (!bookingForm.name || !bookingForm.studentId) return;

    // Generate simulated ticket
    const ticketId = `CC-${selectedEventForBooking.type.substring(0,2).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const seatNo = `${String.fromCharCode(65 + Math.floor(Math.random() * 8))}-${Math.floor(1 + Math.random() * 30)}`;

    setBookedTicket({
      id: ticketId,
      eventName: selectedEventForBooking.name,
      eventTime: selectedEventForBooking.time,
      eventLocation: selectedEventForBooking.location,
      userName: bookingForm.name,
      userStudentId: bookingForm.studentId,
      userDept: bookingForm.dept,
      seat: seatNo
    });
  };

  const handleCloseBooking = () => {
    setSelectedEventForBooking(null);
    setBookedTicket(null);
    setBookingForm({ name: '', studentId: '', dept: 'Computer Science' });
  };

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Urgent Announcement Banner */}
      <div style={{ background: '#f59e0b', color: '#fff', textAlign: 'center', padding: '8px', fontSize: '12px', fontWeight: 'bold' }}>
        📢 Campus Announcement: The library coffee machine is officially out of order. Stay strong, everyone! ☕
      </div>

      {/* App Header */}
      <header className="app-header">
        <div className="logo-section">
          <h1>
            <svg className="logo-icon" viewBox="0 0 24 24">
              <path d="M12 2L2 22h20L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 14h2v2h-2zm0-4h2v3h-2z" />
            </svg>
            CAMPUSCLIMB
          </h1>
          <div className="subtitle">University Navigator & Guide</div>
        </div>

        <nav className="nav-menu">
          <button 
            className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            <MapIcon /> Map Guide
          </button>
          <button 
            className={`nav-item ${activeTab === 'tour' ? 'active' : ''}`}
            onClick={() => setActiveTab('tour')}
          >
            <CompassIcon /> Virtual Tour
          </button>
          <button 
            className={`nav-item ${activeTab === 'utilities' ? 'active' : ''}`}
            onClick={() => setActiveTab('utilities')}
          >
            <ToolsIcon /> Utility Finder
          </button>
          <button 
            className={`nav-item ${activeTab === 'transit' ? 'active' : ''}`}
            onClick={() => setActiveTab('transit')}
          >
            <TruckIcon /> Transit & Events
          </button>
        </nav>
      </header>

      {/* Live Statistics Ribbon */}
      <section className="stats-panel">
        <div className="stat-card">
          <div className="stat-icon-wrapper accent">🏛️</div>
          <div className="stat-info">
            <span className="stat-value">7 / 7</span>
            <span className="stat-label">Open Buildings</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper orange">📅</div>
          <div className="stat-info">
            <span className="stat-value">2 Active Today</span>
            <span className="stat-label">Campus Events</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper purple">🚌</div>
          <div className="stat-info">
            <span className="stat-value">In {shuttleCountdown} mins</span>
            <span className="stat-label">Next Shuttle ({shuttleRouteKey})</span>
          </div>
        </div>
        <div className="stat-card" title="Perfect weather to skip class... but don't do it!">
          <div className="stat-icon-wrapper accent">🌡️</div>
          <div className="stat-info">
            <span className="stat-value">24° C</span>
            <span className="stat-label">Weather: Perfect for Chai</span>
          </div>
        </div>
      </section>

      {/* Quick Actions Ribbon */}
      <section className="quick-actions-panel">
        {[
          { icon: '☕', label: 'Coffee Shops' },
          { icon: '🖨️', label: 'Print Stations' },
          { icon: '🚾', label: 'Nearest Restroom' },
          { icon: '🔍', label: 'Lost & Found' },
          { icon: '📚', label: 'Study Rooms' },
          { icon: '🅿️', label: 'Parking Pass' }
        ].map((action, idx) => (
          <button key={idx} className="quick-action-btn" onClick={() => { setActiveTab('utilities'); setUtilitySearch(action.label.split(' ')[0]); }}>
            <span className="qa-icon">{action.icon}</span>
            <span className="qa-label">{action.label}</span>
          </button>
        ))}
      </section>

      {/* Main Workspace Panel */}
      <main id="main-content" className="main-panel">
        {activeTab === 'map' && (
          <div className="map-guide-layout">
            {/* Left side: Interactive Map */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="utility-filters" style={{ justifyContent: 'flex-start' }}>
                {[
                  { key: 'all', label: 'All Buildings' },
                  { key: 'Academic', label: '📖 Academic' },
                  { key: 'Social', label: '🍔 Social/Dining' },
                  { key: 'Recreation', label: '🏃 Recreation' },
                  { key: 'Residential', label: '🏠 Residence' }
                ].map(item => (
                  <button 
                    key={item.key}
                    className={`filter-chip ${mapCategoryFilter === item.key ? 'active' : ''}`}
                    onClick={() => setMapCategoryFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="map-canvas-container">
                <svg className="map-svg" viewBox="0 0 750 500">
                  {/* Roads / Paths */}
                  <path d="M 50,220 L 700,220" stroke="var(--border)" strokeWidth="8" strokeDasharray="5,5" fill="none" />
                  <path d="M 390,50 L 390,450" stroke="var(--border)" strokeWidth="8" strokeDasharray="5,5" fill="none" />
                  <path d="M 150,220 L 150,120 L 390,120" stroke="var(--border)" strokeWidth="4" fill="none" />
                  <path d="M 550,220 L 550,150 L 390,150" stroke="var(--border)" strokeWidth="4" fill="none" />
                  
                  {/* Central Plaza Circular Lawn */}
                  <circle cx="390" cy="220" r="45" fill="var(--accent-bg)" stroke="var(--accent-border)" strokeWidth="2" />
                  <text x="390" y="223" className="map-label" style={{fill: 'var(--accent)', fontSize: '10px'}}>CENTRAL PLAZA</text>

                  {/* Buildings SVG Rendering */}
                  {BUILDINGS.map((building) => {
                    const isFilteredOut = mapCategoryFilter !== 'all' && building.type !== mapCategoryFilter;
                    return (
                      <g 
                        key={building.id} 
                        className={`map-building-group ${selectedBuilding?.id === building.id ? 'active' : ''} ${isFilteredOut ? 'dimmed' : ''}`}
                        onClick={() => !isFilteredOut && setSelectedBuilding(building)}
                      >
                        <rect 
                          x={building.x} 
                          y={building.y} 
                          width={building.w} 
                          height={building.h} 
                          rx="12" 
                          className="map-building-path" 
                        />
                        <text 
                          x={building.x + building.w/2} 
                          y={building.y + building.h/2 - 5} 
                          className="map-label"
                        >
                          {building.name.split(' ')[0]}
                        </text>
                        <text 
                          x={building.x + building.w/2} 
                          y={building.y + building.h/2 + 12} 
                          className="map-label" 
                          style={{fontSize: '9px', fill: 'var(--text-muted)'}}
                        >
                          ({building.code})
                        </text>
                        
                        {/* Active Selection Pin */}
                        {selectedBuilding?.id === building.id && (
                          <path 
                            d={`M ${building.x + building.w/2} ${building.y - 12} L ${building.x + building.w/2 - 6} ${building.y - 24} A 6 6 0 1 1 ${building.x + building.w/2 + 6} ${building.y - 24} Z`} 
                            className="map-pin" 
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Right side: Building Details Panel */}
            <div className="sidebar-details">
              {selectedBuilding ? (
                <>
                  <div className="building-title-header">
                    <div>
                      <h2>{selectedBuilding.name}</h2>
                      <span className="stat-label">Code: {selectedBuilding.code} | {selectedBuilding.type}</span>
                    </div>
                    <span className={`building-badge ${selectedBuilding.status.toLowerCase() === 'open' ? 'open' : 'closed'}`}>
                      {selectedBuilding.status}
                    </span>
                  </div>

                  <div className="building-meta-grid">
                    <div className="meta-item">
                      <span className="meta-icon">⏰</span>
                      <div>
                        <div className="section-label" style={{marginBottom: '2px'}}>Hours</div>
                        <div>{selectedBuilding.time}</div>
                      </div>
                    </div>
                    <div className="meta-item">
                      <span className="meta-icon">📍</span>
                      <div>
                        <div className="section-label" style={{marginBottom: '2px'}}>Location</div>
                        <div>{selectedBuilding.location}</div>
                      </div>
                    </div>
                    <div className="meta-item">
                      <span className="meta-icon">👥</span>
                      <div>
                        <div className="section-label" style={{marginBottom: '2px'}}>Live Crowdedness</div>
                        <div>{selectedBuilding.capacity} Filled</div>
                      </div>
                    </div>
                    <div className="meta-item">
                      <span className="meta-icon">⭐</span>
                      <div>
                        <div className="section-label" style={{marginBottom: '2px'}}>Popular Spot</div>
                        <div>{selectedBuilding.popularSpots}</div>
                      </div>
                    </div>
                  </div>

                  <p className="building-description">
                    {selectedBuilding.description}
                  </p>

                  <div>
                    <div className="section-label">Key Facilities</div>
                    <div className="features-list">
                      {selectedBuilding.features.map((feature, i) => (
                        <span key={i} className="feature-tag">{feature}</span>
                      ))}
                    </div>
                  </div>

                  <div className="busy-hours-indicator">
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px'}}>
                      <span className="section-label">Current Occupancy Index</span>
                      <span style={{fontWeight: '700', color: 'var(--accent)'}}>{selectedBuilding.busyHours}%</span>
                    </div>
                    <div className="busy-progress-bar">
                      <div className="busy-progress-fill" style={{width: `${selectedBuilding.busyHours}%`}}></div>
                    </div>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px dashed var(--border)', margin: '16px 0' }} />

                  {/* Reviews Section */}
                  <div className="reviews-section">
                    <div className="section-label">Student Reviews & Ratings</div>
                    <div className="reviews-list">
                      {(buildingReviews[selectedBuilding.id] || []).map((rev, idx) => (
                        <div key={idx} className="review-item-mini">
                          <div className="review-meta">
                            <span className="reviewer-name">{rev.name}</span>
                            <span className="review-stars">{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</span>
                          </div>
                          <p className="review-text">{rev.text}</p>
                        </div>
                      ))}
                      {(buildingReviews[selectedBuilding.id] || []).length === 0 && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No reviews yet. Be the first to add one!</p>
                      )}
                    </div>

                    {/* Add Review Form */}
                    <form onSubmit={handleReviewSubmit} className="add-review-form">
                      <div className="form-row-compact">
                        <input 
                          type="text" 
                          placeholder="Your Name" 
                          required
                          value={newReview.name}
                          onChange={(e) => setNewReview({ ...newReview, name: e.target.value })}
                          className="review-input"
                        />
                        <select 
                          value={newReview.rating}
                          onChange={(e) => setNewReview({ ...newReview, rating: Number(e.target.value) })}
                          className="review-input rating-select"
                        >
                          <option value="5">⭐⭐⭐⭐⭐</option>
                          <option value="4">⭐⭐⭐⭐</option>
                          <option value="3">⭐⭐⭐</option>
                          <option value="2">⭐⭐</option>
                          <option value="1">⭐</option>
                        </select>
                      </div>
                      <textarea 
                        placeholder="Write a quick tip or feedback..." 
                        required
                        rows="2"
                        value={newReview.text}
                        onChange={(e) => setNewReview({ ...newReview, text: e.target.value })}
                        className="review-input text-area"
                      />
                      <button type="submit" className="filter-chip active review-submit-btn">
                        Submit Review
                      </button>
                    </form>
                  </div>

                </>
              ) : (
                <div className="sidebar-placeholder">
                  <div className="pulse-circle">📍</div>
                  <h3>Select a Building</h3>
                  <p>Click on any highlighted building on the map blueprint to view live stats, facilities, and occupancies.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tour' && (
          <div className="tour-container">
            <div className="tour-hero-frame">
              <img src={TOUR_STEPS[tourStep].image} alt={TOUR_STEPS[tourStep].title} className="tour-image" />
              <div className="tour-gradient-overlay">
                <span className="building-badge open" style={{alignSelf: 'flex-start', marginBottom: '8px', background: 'var(--purple-bg)', color: 'var(--purple)', borderColor: 'var(--purple-border)'}}>
                  Stop {tourStep + 1} of {TOUR_STEPS.length} : {TOUR_STEPS[tourStep].landmarkName}
                </span>
                <h2 className="tour-overlay-title">{TOUR_STEPS[tourStep].title}</h2>
                <p className="tour-overlay-desc">{TOUR_STEPS[tourStep].description}</p>
              </div>
            </div>

            <div className="tour-controls">
              <button 
                className="tour-btn" 
                onClick={() => setTourStep(prev => Math.max(0, prev - 1))}
                disabled={tourStep === 0}
                aria-label="Previous Stop"
              >
                ◀
              </button>
              <div className="tour-stepper">
                {TOUR_STEPS.map((_, idx) => (
                  <span 
                    key={idx} 
                    className={`step-dot ${idx === tourStep ? 'active' : ''}`}
                    onClick={() => setTourStep(idx)}
                    style={{cursor: 'pointer'}}
                  ></span>
                ))}
              </div>
              <button 
                className="tour-btn" 
                onClick={() => setTourStep(prev => Math.min(TOUR_STEPS.length - 1, prev + 1))}
                disabled={tourStep === TOUR_STEPS.length - 1}
                aria-label="Next Stop"
              >
                ▶
              </button>
              <button
                className="filter-chip"
                style={{ marginLeft: 'auto', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                onClick={() => setActiveTab('map')}
              >
                End Tour
              </button>
            </div>
          </div>
        )}

        {activeTab === 'utilities' && (
          <div>
            <div className="utilities-search-box">
              <input 
                type="text" 
                className="utility-search-input" 
                placeholder="Search amenities (e.g. printer, water, washroom)..." 
                value={utilitySearch}
                onChange={(e) => setUtilitySearch(e.target.value)}
              />
              <div className="utility-filters">
                {[
                  { filter: 'all', label: 'All Utilities' },
                  { filter: 'water', label: '🚰 Water' },
                  { filter: 'wifi', label: '📶 Wi-Fi' },
                  { filter: 'restroom', label: '🚻 Restrooms' },
                  { filter: 'study', label: '📖 Study Hubs' },
                  { filter: 'security', label: '🛡️ Safety' }
                ].map((chip) => (
                  <button 
                    key={chip.filter}
                    className={`filter-chip ${utilityFilter === chip.filter ? 'active' : ''}`}
                    onClick={() => setUtilityFilter(chip.filter)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="utilities-grid">
              {filteredUtilities.map((item) => (
                <div key={item.id} className="utility-card">
                  <div className="utility-card-header">
                    <div className="utility-icon-box">
                      {item.type === 'water' && '🚰'}
                      {item.type === 'wifi' && '📶'}
                      {item.type === 'restroom' && '🚻'}
                      {item.type === 'study' && '📖'}
                      {item.type === 'security' && '🛡️'}
                    </div>
                    <span className="utility-distance">{item.distance}</span>
                  </div>
                  <div>
                    <h3 className="utility-name">{item.name}</h3>
                    <p className="utility-desc">{item.desc}</p>
                  </div>
                  <div className="utility-location-hint">
                    📍 {item.locationHint}
                  </div>
                </div>
              ))}
              {filteredUtilities.length === 0 && (
                <div className="sidebar-placeholder" style={{gridColumn: '1 / -1', padding: '60px'}}>
                  <h3>No Amenities Found</h3>
                  <p>Try clearing your filters or searching for something else like "water" or "library".</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            <div className="shuttle-events-layout">
              {/* Events column */}
              <div>
                <h2 className="panel-section-title">📅 Campus Event Feed</h2>
                <div className="events-feed">
                  {EVENTS.map((event) => (
                    <div key={event.id} className="event-item-card">
                      <div className="event-meta-top">
                        <span className="event-badge">{event.type}</span>
                        <span className="event-time">{event.time}</span>
                      </div>
                      <h3 className="event-name">{event.name}</h3>
                      <div className="event-location">
                        <span>📍</span> {event.location}
                        <span className={`event-status-indicator ${event.status === 'Live' ? 'live' : ''}`}>
                          <span className="status-dot"></span> {event.status}
                        </span>
                      </div>
                      
                      <button 
                        className="filter-chip active"
                        style={{ marginTop: '12px', width: 'fit-content', padding: '6px 12px', fontSize: '11px' }}
                        onClick={() => setSelectedEventForBooking(event)}
                      >
                        🎟️ Book Pass / Reserve Seat
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shuttle tracker column */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 className="panel-section-title" style={{ margin: 0 }}>🚌 Live Shuttle Loop</h2>
                  <div className="utility-filters" style={{ margin: 0 }}>
                    <select 
                      value={shuttleRouteKey} 
                      onChange={(e) => {
                        setShuttleRouteKey(e.target.value);
                        // Set countdown dynamically based on route selection to feel realistic
                        if (e.target.value === 'inner') setShuttleCountdown(4);
                        else if (e.target.value === 'outer') setShuttleCountdown(9);
                        else setShuttleCountdown(2);
                      }}
                      className="utility-search-input"
                      style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}
                    >
                      <option value="inner">Inner Academic Loop</option>
                      <option value="outer">Outer Residential Loop</option>
                      <option value="express">Express Route</option>
                    </select>
                  </div>
                </div>

                <div className="shuttle-tracker-box">
                  <div className="shuttle-map-route">
                    <div className="route-line"></div>
                    {SHUTTLE_ROUTES[shuttleRouteKey].stops.map((stop, index) => {
                      const pos = SHUTTLE_ROUTES[shuttleRouteKey].positions[index];
                      return (
                        <div key={stop} className="route-stop" style={{ left: `${pos}%` }}>
                          <span className="route-stop-name">{stop}</span>
                        </div>
                      );
                    })}
                    <div className="shuttle-bus-icon">🚌</div>
                  </div>

                  <div className="shuttle-info-card">
                    <div className="shuttle-status-row">
                      <span className="shuttle-status-label">Route Loop</span>
                      <span className="shuttle-status-value">{SHUTTLE_ROUTES[shuttleRouteKey].name}</span>
                    </div>
                    <div className="shuttle-status-row">
                      <span className="shuttle-status-label">Status</span>
                      <span className="shuttle-status-value" style={{color: 'var(--accent)'}}>● Active & Running</span>
                    </div>
                    <div className="shuttle-status-row">
                      <span className="shuttle-status-label">Current Route Stops</span>
                      <span className="shuttle-status-value" style={{fontSize: '11px'}}>{SHUTTLE_ROUTES[shuttleRouteKey].stops.join(' ➔ ')}</span>
                    </div>
                    <div className="shuttle-status-row" style={{borderBottom: 'none'}}>
                      <span className="shuttle-status-label">Estimated Arrival</span>
                      <span className="shuttle-status-value" style={{color: 'var(--orange)'}}>{shuttleCountdown} mins</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
            
            {/* FAQ Accordion Component */}
            <FAQSection />
          </div>
        )}
      </main>

      {/* Booking Overlay Modal */}
      {selectedEventForBooking && (
        <div className="modal-overlay">
          <div className="booking-modal-card">
            <button className="modal-close-btn" onClick={handleCloseBooking}>✕</button>
            
            {!bookedTicket ? (
              <>
                <div className="modal-header">
                  <h2>Reserve Event Pass</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Securing your entrance to: <strong style={{ color: 'var(--text-h)' }}>{selectedEventForBooking.name}</strong>
                  </p>
                </div>

                <form onSubmit={handleBookingSubmit} className="booking-form">
                  <div className="form-group">
                    <label className="section-label">Full Name</label>
                    <input 
                      type="text" 
                      required 
                      className="utility-search-input" 
                      placeholder="e.g. Rahul Kumar"
                      value={bookingForm.name}
                      onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="section-label">Student / Roll ID</label>
                    <input 
                      type="text" 
                      required 
                      className="utility-search-input" 
                      placeholder="e.g. CS-2025-1049"
                      value={bookingForm.studentId}
                      onChange={(e) => setBookingForm({ ...bookingForm, studentId: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="section-label">Academic Department</label>
                    <select 
                      className="utility-search-input"
                      value={bookingForm.dept}
                      onChange={(e) => setBookingForm({ ...bookingForm, dept: e.target.value })}
                    >
                      <option value="Computer Science">Computer Science & Eng.</option>
                      <option value="Electronics & Comm">Electronics & Comm. Eng.</option>
                      <option value="Mechanical Eng.">Mechanical Engineering</option>
                      <option value="Applied Sciences">Applied Sciences</option>
                      <option value="Business School">Business Administration</option>
                    </select>
                  </div>
                  <button type="submit" className="booking-submit-btn">
                    🎟️ Confirm Booking & Generate Pass
                  </button>
                </form>
              </>
            ) : (
              <div className="ticket-success-view">
                <div className="success-checkmark">✓</div>
                <h3>🎉 Pass Successfully Reserved! 🎉</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
                  Please present the ticket reference code below at the venue entrance.
                </p>

                {/* Glassmorphic Ticket */}
                <div className="ticket-badge-card">
                  <div className="ticket-header">
                    <span className="ticket-brand">CAMPUSCLIMB TICKET</span>
                    <span className="ticket-id">{bookedTicket.id}</span>
                  </div>
                  <div className="ticket-body">
                    <div className="ticket-title">{bookedTicket.eventName}</div>
                    <div className="ticket-details-grid">
                      <div>
                        <div className="ticket-label">Holder</div>
                        <div className="ticket-value">{bookedTicket.userName}</div>
                      </div>
                      <div>
                        <div className="ticket-label">Student ID</div>
                        <div className="ticket-value">{bookedTicket.userStudentId}</div>
                      </div>
                      <div>
                        <div className="ticket-label">Location</div>
                        <div className="ticket-value">{bookedTicket.eventLocation}</div>
                      </div>
                      <div>
                        <div className="ticket-label">Time</div>
                        <div className="ticket-value" style={{ fontSize: '10px' }}>{bookedTicket.eventTime}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ticket-label">Seat Assignment</div>
                          <div className="ticket-value" style={{ color: 'var(--orange)' }}>{bookedTicket.seat}</div>
                        </div>
                        <div className="ticket-barcode">|||| | ||||| | |||</div>
                      </div>
                    </div>
                  </div>
                </div>

                <button 
                  className="filter-chip active" 
                  style={{ marginTop: '24px', padding: '10px 20px' }} 
                  onClick={handleCloseBooking}
                >
                  Close & Return
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating SOS Trigger Button */}
      <button className="floating-sos-btn" onClick={() => setSosModalOpen(true)}>
        🚨 SOS Emergency
      </button>

      {/* SOS Emergency Modal */}
      {sosModalOpen && (
        <div className="modal-overlay">
          <div className="booking-modal-card sos-modal-card">
            <button className="modal-close-btn" onClick={() => { setSosModalOpen(false); setSosAlertActive(false); }}>✕</button>
            <div className="modal-header">
              <h2 style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                🚨 Campus SOS Emergency Hub
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Quick contact or emergency alert trigger for immediate campus security dispatch.
              </p>
            </div>

            {!sosAlertActive ? (
              <div className="sos-panel-content">
                <div className="emergency-contacts-list">
                  <div className="contact-row">
                    <span className="contact-icon">📞</span>
                    <div className="contact-details">
                      <div className="contact-label">Campus Security Desk</div>
                      <div className="contact-value">+91 99999-88888</div>
                    </div>
                  </div>
                  <div className="contact-row">
                    <span className="contact-icon">🚑</span>
                    <div className="contact-details">
                      <div className="contact-label">Medical Center Helpline</div>
                      <div className="contact-value">+91 88888-77777</div>
                    </div>
                  </div>
                  <div className="contact-row">
                    <span className="contact-icon">👮</span>
                    <div className="contact-details">
                      <div className="contact-label">State Police Helpline</div>
                      <div className="contact-value">112</div>
                    </div>
                  </div>
                </div>

                <button className="trigger-sos-action-btn" onClick={() => setSosAlertActive(true)}>
                  🔴 TRIGGER EMERGENCY ALERT
                </button>
              </div>
            ) : (
              <div className="ticket-success-view">
                <div className="sos-pulse-container">
                  <div className="sos-pulse-ring"></div>
                  <div className="sos-pulse-inner">🚨</div>
                </div>
                <h3 style={{ color: '#ef4444' }}>SOS Emergency Signal Sent!</h3>
                <p style={{ color: 'var(--text-h)', fontWeight: '600', fontSize: '14px', marginTop: '10px' }}>
                  Broadcasting your location...
                </p>
                <div className="sos-dispatch-info">
                  <p>🚨 <strong>Dispatch Alert:</strong> Campus Security Response Vehicle has been dispatched. Estimated arrival: <strong>3 minutes</strong>.</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
                    Stay calm, remain in a well-lit/populated location if possible. A security officer has been notified.
                  </p>
                </div>
                <button 
                  className="filter-chip active" 
                  style={{ marginTop: '20px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' }} 
                  onClick={() => setSosAlertActive(false)}
                >
                  Cancel / Clear Alert
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} CampusClimb Guide. Built with ❤️, ☕, and a lot of 🐛 bugs.</p>
        <p style={{ marginTop: '8px', fontSize: '11px', fontStyle: 'italic', color: 'var(--text-muted)', opacity: 0.7 }}>
          Campus Wisdom: "If you can't find the library, follow the students with the biggest coffee cups." ☕
        </p>
      </footer>
    </div>
  );
}


export default App;
