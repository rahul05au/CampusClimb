import React, { useState } from 'react';

const FAQS = [
  {
    question: "📶 How do I connect to the Campus Secure Wi-Fi?",
    answer: "Select the 'Campus-Secure' network on your device, log in using your student portal email (e.g., student@university.edu) and your portal password. For guests, please visit the Main Gate Security booth to get a 24-hour guest access code."
  },
  {
    question: "🪪 Where and when can I get my Student ID Card?",
    answer: "Student ID cards are issued at the Administrative Hub (Room 102, Ground Floor) between 09:00 AM and 04:00 PM, Monday through Friday. Bring your admission letter and a valid government ID (like Aadhaar, Passport, or DL)."
  },
  {
    question: "📖 Can I access the library archives online?",
    answer: "Yes! Visit the Central Library website and log in using your student credentials. You will have full remote access to IEEE journals, JSTOR databases, and over 50,000 digital textbooks."
  },
  {
    question: "🚗 Is student parking allowed on campus?",
    answer: "Yes, students can park in Sector-B (near Hostels) and Sector-D (near the Sports Complex). A parking permit is required, which you can apply for at the Security Hub or via the student portal for a fee of ₹500 per semester."
  },
  {
    question: "🩺 What should I do in case of a medical emergency?",
    answer: "Visit the First Aid Emergency Room located in the Admin Hub (East Wing, Room 104). You can also call the campus medical helpline at +91 98765-43210. An ambulance is stationed 24/7 near the Sports Complex."
  }
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="faq-container">
      <h2 className="panel-section-title">❓ Campus Help & FAQs</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px', textAlign: 'left' }}>
        Quick answers to the most common questions asked by freshmen, visitors, and campus climbers.
      </p>
      
      <div className="faq-list">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={index} className={`faq-item ${isOpen ? 'open' : ''}`}>
              <button className="faq-question-btn" onClick={() => toggleFAQ(index)}>
                <span>{faq.question}</span>
                <span className="faq-arrow">{isOpen ? '▼' : '▶'}</span>
              </button>
              <div className="faq-answer-wrapper">
                <div className="faq-answer-content">
                  <p>{faq.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FAQSection;
