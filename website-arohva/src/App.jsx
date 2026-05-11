import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DocumentHead from './components/DocumentHead';
import Home from './pages/Home';
import Product from './pages/Product';
import About from './pages/About';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';

export default function App() {
  return (
    <>
      <DocumentHead />
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/product" element={<Product />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Routes>
      </Layout>
    </>
  );
}
