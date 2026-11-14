export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg p-12">
        <h1 className="text-4xl font-bold mb-4">Wellness & Population Health Analytics</h1>
        <p className="text-xl mb-8">
          Complete B2B/B2G platform for health data collection, processing, and territorial analytics
        </p>
        <div className="flex gap-4">
          <a href="/collect" className="bg-white text-primary px-6 py-3 rounded-lg font-semibold hover:bg-gray-100">
            Start Collecting Data
          </a>
          <a href="/dashboard" className="bg-primary/80 text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary/70 border border-white">
            View Analytics
          </a>
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid md:grid-cols-3 gap-6">
        <div className="card hover:shadow-lg transition">
          <div className="text-3xl mb-2">📊</div>
          <h3 className="text-xl font-bold mb-2">Data Collection Portal</h3>
          <p className="text-gray-600">
            Secure bulk Excel upload with role-based access for B2B and B2G stakeholders
          </p>
        </div>
        
        <div className="card hover:shadow-lg transition">
          <div className="text-3xl mb-2">🔄</div>
          <h3 className="text-xl font-bold mb-2">Deterministic Pipeline</h3>
          <p className="text-gray-600">
            Strict FSM-based processing with zero data leakage between tenants
          </p>
        </div>
        
        <div className="card hover:shadow-lg transition">
          <div className="text-3xl mb-2">🗺️</div>
          <h3 className="text-xl font-bold mb-2">Territory Mapping</h3>
          <p className="text-gray-600">
            Interactive geospatial dashboard with health rank visualization
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="grid md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">4</div>
          <p className="text-gray-600">Pipeline Stages</p>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">3</div>
          <p className="text-gray-600">Core Dimensions</p>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">10+</div>
          <p className="text-gray-600">Regions Supported</p>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">Zero</div>
          <p className="text-gray-600">Data Leakage</p>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="card">
        <h2 className="text-2xl font-bold mb-6">Technology Stack</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-3 text-primary">Frontend</h3>
            <ul className="space-y-2 text-gray-600">
              <li>✓ Next.js 14+ (App Router)</li>
              <li>✓ TypeScript & Tailwind CSS</li>
              <li>✓ Recharts for Analytics</li>
              <li>✓ React-Leaflet for Maps</li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-3 text-primary">Backend</h3>
            <ul className="space-y-2 text-gray-600">
              <li>✓ Python 3.11+ FastAPI</li>
              <li>✓ Pydantic v2 Validation</li>
              <li>✓ Deterministic FSM Pipeline</li>
              <li>✓ Tenant Isolation Guarantee</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
