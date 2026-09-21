"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  MapPin,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { categories, packs, products } from "@/lib/products";
import { money, priceBasket } from "@/lib/pricing";
import { track } from "@/lib/analytics";
import { Wordmark } from "@/components/ui/wordmark";
import { ProductArt } from "@/components/ui/product-art";
import { Quantity } from "@/components/cart/quantity";
import { DesktopCart } from "@/components/cart/cart";
import { useCart } from "@/components/providers";
import { Modal } from "@/components/ui/modal";
import { locationSchema } from "@/lib/validation";
import type { Product } from "@/types";
function ProductCard({ product }: { product: Product }) {
  const ref = useRef<HTMLElement>(null);
  const viewed = useRef(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !viewed.current) {
          viewed.current = true;
          track("product_viewed", {
            product: product.id,
            category: product.category,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [product]);
  return (
    <article className="product-card" ref={ref}>
      {product.tag && <span className="product-tag">{product.tag}</span>}
      <div className="product-picture">
        <ProductArt product={product} />
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <p>{product.size}</p>
        <div className="product-bottom">
          <strong>{money(product.price)}</strong>
          <Quantity id={product.id} name={product.name} />
        </div>
      </div>
    </article>
  );
}
export function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("categoria") || "todos";
  const active = categories.some((c) => c.id === requested)
    ? requested
    : "todos";
  const [search, setSearch] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressError, setAddressError] = useState("");
  const { location, setLocation, openCart, items, add } = useCart();
  const priced = priceBasket(items);
  const filtered = products.filter(
    (p) =>
      (active === "todos" || p.category === active) &&
      `${p.name} ${p.size}`
        .toLocaleLowerCase("pt")
        .includes(search.toLocaleLowerCase("pt")),
  );
  function chooseCategory(id: string) {
    track("category_clicked", { category: id, source: "catalog" });
    router.replace(id === "todos" ? "/pedir" : `/pedir?categoria=${id}`, {
      scroll: false,
    });
  }
  function saveAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = locationSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setAddressError(parsed.error.issues[0].message);
      return;
    }
    setLocation(parsed.data);
    track("location_entered", parsed.data);
    setAddressOpen(false);
  }
  return (
    <>
      <header className="shop-header">
        <div className="container shop-nav">
          <div className="shop-brand">
            <Link
              className="icon-button"
              href="/"
              aria-label="Voltar ao início"
            >
              <ArrowLeft size={20} />
            </Link>
            <Wordmark />
          </div>
          <button
            className="address-button"
            onClick={() => setAddressOpen(true)}
          >
            <MapPin size={20} />
            <span>
              <small>Entregar em…</small>
              <strong>
                {location
                  ? `${location.city}, ${location.postcode}`
                  : "Rua, zona ou código postal"}
              </strong>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <button
            className="shop-cart-button"
            onClick={openCart}
            aria-label={`Ver carrinho, ${priced.item_count} artigos`}
          >
            <ShoppingBag size={21} />
            <span>{priced.item_count}</span>
          </button>
        </div>
      </header>
      <main id="main" className="container shop-layout">
        <div className="catalog-main">
          <div className="catalog-intro">
            <div>
              <span className="small-label">
                O botão de emergência da tua noite.
              </span>
              <h1>O que é que falta?</h1>
              <p>Tu ficas. A Jola trata do resto.</p>
            </div>
            <span className="catalog-time">
              <Clock3 size={16} />
              22–32 min<span>no lançamento</span>
            </span>
          </div>
          <div className="catalog-banner">
            <div>
              <span>Poupa nas decisões.</span>
              <h2>A noite toda, num pack.</h2>
              <p>De um pré tranquilo a uma casa cheia.</p>
            </div>
            <button
              onClick={() => {
                add(packs[1].id);
              }}
              className="banner-pack"
            >
              <ShoppingBag size={34} />
              <span>
                A Clássica<strong>{money(packs[1].price)} +</strong>
              </span>
            </button>
          </div>
          <div className="catalog-controls">
            <div className="search-field">
              <Search size={18} />
              <input
                aria-label="Procurar produtos"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Procuras alguma coisa?"
              />
              {search && (
                <button
                  aria-label="Limpar pesquisa"
                  onClick={() => setSearch("")}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <div className="category-chips" aria-label="Categorias">
              <button
                className={active === "todos" ? "active" : ""}
                aria-pressed={active === "todos"}
                onClick={() => chooseCategory("todos")}
              >
                Tudo para a noite
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={active === c.id ? "active" : ""}
                  aria-pressed={active === c.id}
                  onClick={() => chooseCategory(c.id)}
                >
                  <span>{c.emoji}</span>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div className="catalog-heading">
            <h2>
              {search
                ? `Resultados para “${search}”`
                : active === "todos"
                  ? "Os essenciais"
                  : categories.find((c) => c.id === active)?.name}
            </h2>
            <span>{filtered.length} produtos</span>
          </div>
          <p className="catalog-preview">
            Catálogo de antevisão · preços ilustrativos · sem vendas reais
          </p>
          <div className="product-grid" key={active}>
            {filtered.map((product) => (
              <ProductCard product={product} key={product.id} />
            ))}
          </div>
          {!filtered.length && (
            <div className="search-empty">
              <Search size={32} />
              <h3>Ainda não temos isso no saco.</h3>
              <p>Experimenta outro nome ou espreita as outras categorias.</p>
              <button
                className="button button-secondary"
                onClick={() => {
                  setSearch("");
                  chooseCategory("todos");
                }}
              >
                Ver todos os produtos
              </button>
            </div>
          )}
          <p className="catalog-end">
            O essencial está aqui. A melhor parte da noite está aí.
          </p>
        </div>
        <DesktopCart />
      </main>
      <Modal
        open={addressOpen}
        onOpenChange={setAddressOpen}
        title="Onde é a festa?"
        description="Só precisamos da cidade e do código postal para saber onde faz sentido chegar primeiro."
      >
        <form className="form-stack" onSubmit={saveAddress}>
          <label>
            Cidade
            <input
              required
              name="city"
              defaultValue={location?.city}
              minLength={2}
              maxLength={80}
              placeholder="Lisboa"
              autoComplete="address-level2"
            />
          </label>
          <label>
            Código postal
            <input
              required
              name="postcode"
              defaultValue={location?.postcode}
              pattern="[0-9]{4}-[0-9]{3}"
              inputMode="numeric"
              maxLength={8}
              placeholder="1000-001"
              autoComplete="postal-code"
            />
          </label>
          {addressError && (
            <p role="alert" className="form-error">
              {addressError}
            </p>
          )}
          <button className="button button-primary">
            Guardar zona
            <ArrowRightIcon />
          </button>
        </form>
      </Modal>
    </>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={18} />;
}
