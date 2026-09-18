import "./CSS/App.css";
import About from "./components/About";
import CTA from "./components/CTA";
import Features from "./components/Features";
import Footer from "./components/Footer";
import FaqCtaSection from "./components/FaqCtaSection";
import Header from "./components/Header";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Services from "./components/Services";

function App() {
  return (
    <>
      <Header />
      <Hero />
      <About />
      <Features />
      <HowItWorks />
      <Services />
      <CTA />
      <FaqCtaSection />
      <Footer />
    </>
  );
}

export default App;
