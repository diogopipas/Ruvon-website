// Generated for mission cmwshyghc0043ctygzmnu7noe. Founder review and project validation required.
// This standalone route introduces no new dependencies or tracking code.
const product = {"name":"Ruvon","description":"A Portuguese drinks-and-party delivery concept presented as a demand-validation MVP. It lets visitors browse a simulated catalogue, configure packs, build a basket, and register interest; it does not currently provide live alcohol sales, payments, or delivery. This profile is an inference for founder review.","segment":"Adults in Portugal who are organizing a small private celebration and are already considering drinks and party supplies.","features":["Mobile-first website and product catalogue with packs, individual products, search, categories, filters, and a cart.","Simulated checkout that collects city and contact details and persists a lead and basket.","Age confirmation before catalogue access.","Protected demand dashboard with funnel, product, city, campaign, and merchant-interest metrics.","Pack configuration with price updates and server-side price validation.","Optional Easypay MB WAY sandbox checkout; it uses test APIs and does not move money.","Separate A.M.O. discovery pack page; ordering is unavailable."],"website":"https://ruvon.store","headline":"Ruvon, for Adults in Portugal who are organizing a small private celebration and are already considering drinks and party supplies.","cta":"Explore the product"};

export default function GrowthLandingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f7f9fb", color: "#1d2939", fontFamily: "system-ui, sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <a href={product.website} style={{ color: "inherit", fontSize: 20, fontWeight: 700 }}>{product.name}</a>
        <section style={{ padding: "90px 0 56px" }}>
          <p style={{ color: "#52606d" }}>For {product.segment}</p>
          <h1 style={{ fontSize: "clamp(36px, 7vw, 64px)", letterSpacing: "-0.04em", lineHeight: 1.1, maxWidth: 800 }}>{product.headline}</h1>
          <p style={{ fontSize: 20, lineHeight: 1.7, maxWidth: 640 }}>{product.description}</p>
          <a href={product.website} style={{ display: "inline-block", marginTop: 20, padding: "15px 24px", borderRadius: 8, background: "#25765c", color: "white", textDecoration: "none" }}>{product.cta}</a>
        </section>
        {product.features.length > 0 && <section aria-label="Product capabilities" style={{ borderTop: "1px solid #dce2e8", paddingTop: 24 }}>
          <h2>Built to help you move forward</h2>
          <ul style={{ lineHeight: 2 }}>{product.features.map((feature, index) => <li key={index}>{feature}</li>)}</ul>
        </section>}
        <footer style={{ marginTop: 70, color: "#667085", fontSize: 14 }}>{product.name}</footer>
      </div>
    </main>
  );
}
