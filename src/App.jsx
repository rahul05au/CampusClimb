import React, { useState, useEffect } from 'react';
import heroImg from './assets/hero.png';
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
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
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

function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [selectedBuilding, setSelectedBuilding] = useState(BUILDINGS[0]);
  const [tourStep, setTourStep] = useState(0);
  const [utilityFilter, setUtilityFilter] = useState('all');
  const [utilitySearch, setUtilitySearch] = useState('');
  const [shuttleCountdown, setShuttleCountdown] = useState(8);

  // Shuttle countdown simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setShuttleCountdown(prev => (prev <= 1 ? 12 : prev - 1));
    }, 60000); // decrement every minute
    return () => clearInterval(interval);
  }, []);

  const filteredUtilities = UTILITIES.filter(item => {
    const matchesFilter = utilityFilter === 'all' || item.type === utilityFilter;
    const matchesSearch = item.name.toLowerCase().includes(utilitySearch.toLowerCase()) || 
                          item.desc.toLowerCase().includes(utilitySearch.toLowerCase()) ||
                          item.locationHint.toLowerCase().includes(utilitySearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="app-container">
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
            <span className="stat-label">Next Campus Shuttle</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper accent">🌡️</div>
          <div className="stat-info">
            <span className="stat-value">24° C</span>
            <span className="stat-label">Weather: Clear Sky</span>
          </div>
        </div>
      </section>

      {/* Main Workspace Panel */}
      <main className="main-panel">
        {activeTab === 'map' && (
          <div className="map-guide-layout">
            {/* Left side: Interactive Map */}
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
                {BUILDINGS.map((building) => (
                  <g 
                    key={building.id} 
                    className={`map-building-group ${selectedBuilding?.id === building.id ? 'active' : ''}`}
                    onClick={() => setSelectedBuilding(building)}
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
                ))}
              </svg>
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
                </>
              ) : (
                <div className="sidebar-placeholder">
                  <div className="pulse-circle">📍</div>
                  <h3>Select a Building</h3>
                  <p>Click on any building on the campus blueprint map to view its live statistics, opening hours, popular student corners, and features.</p>
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
                      <span style={{
                        marginLeft: 'auto', 
                        fontSize: '11px', 
                        color: event.status === 'Live' ? 'var(--accent)' : 'var(--text-muted)', 
                        fontWeight: '700'
                      }}>
                        ● {event.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shuttle tracker column */}
            <div>
              <h2 className="panel-section-title">🚌 Live Shuttle Loop</h2>
              <div className="shuttle-tracker-box">
                <div className="shuttle-map-route">
                  <div className="route-line"></div>
                  <div className="route-stop"><span className="route-stop-name">Main Gate</span></div>
                  <div className="route-stop"><span className="route-stop-name">Library</span></div>
                  <div className="route-stop"><span className="route-stop-name">Cafeteria</span></div>
                  <div className="route-stop"><span className="route-stop-name">Hostels</span></div>
                  <div className="shuttle-bus-icon">🚌</div>
                </div>

                <div className="shuttle-info-card">
                  <div className="shuttle-status-row">
                    <span className="shuttle-status-label">Route Loop</span>
                    <span className="shuttle-status-value">Express Outer Ring</span>
                  </div>
                  <div className="shuttle-status-row">
                    <span className="shuttle-status-label">Status</span>
                    <span className="shuttle-status-value" style={{color: 'var(--accent)'}}>● On Time</span>
                  </div>
                  <div className="shuttle-status-row">
                    <span className="shuttle-status-label">Next Stop</span>
                    <span className="shuttle-status-value">Central Library</span>
                  </div>
                  <div className="shuttle-status-row" style={{borderBottom: 'none'}}>
                    <span className="shuttle-status-label">Estimated Arrival</span>
                    <span className="shuttle-status-value" style={{color: 'var(--orange)'}}>{shuttleCountdown} mins</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} CampusClimb Guide. Built for university onboarding and navigation.</p>
      </footer>
    </div>
  );
}

export default App;
