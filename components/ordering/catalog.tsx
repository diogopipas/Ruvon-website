"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  MapPin,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { categories, packs, productById, products } from "@/lib/products";
import { priceBasket } from "@/lib/pricing";
import { track } from "@/lib/analytics";
import { PackBrowser } from "@/components/packs/pack-browser";
import { AmoPilotCatalog, type AmoPilotProduct } from "./amo-pilot-catalog";
import { ProductCard } from "./product-card";
import { CategoryGallery } from "./category-gallery";
import { Wordmark } from "@/components/ui/wordmark";
import { Footer } from "@/components/ui/footer";
import { MerchantAccess } from "@/components/landing/landing-actions";
import { useCart } from "@/components/providers";
import { Modal } from "@/components/ui/modal";
import { CitySelect } from "@/components/ui/city-select";
import { locationSchema } from "@/lib/validation";

const catalogCategories = [
  { id: "todos", name: "Tudo", product: null },
  { id: "cerveja", name: "Cerveja", product: "super-bock" },
  { id: "packs", name: "Packs", product: null },
  { id: "amo", name: "A.M.O.", product: null },
  { id: "cidra", name: "Cidra", product: "somersby" },
  { id: "spirits", name: "Destilados", product: "gin" },
  { id: "vinho", name: "Vinho", product: "vinho-tinto" },
  { id: "gelo-mixers", name: "Gelo e mixers", product: "gelo" },
  { id: "snacks", name: "Snacks", product: "doritos" },
  { id: "festa", name: "Extras", product: "copos" },
];
const essentialIds = [
  "super-bock",
  "somersby",
  "gelo",
  "gin",
  "coca-cola",
  "vinho-branco",
  "doritos",
  "agua",
];
const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt")
    .trim();

function scrollToCatalogSection(
  section: HTMLElement | null,
  onlyWhenHidden = false,
) {
  if (!section) return;
  section.focus({ preventScroll: true });
  const headerHeight =
    document.querySelector(".store-header")?.getBoundingClientRect().height ??
    80;
  const top = section.getBoundingClientRect().top;
  if (onlyWhenHidden && top >= headerHeight && top < window.innerHeight - 100)
    return;
  window.scrollTo({
    top:
      window.scrollY + section.getBoundingClientRect().top - headerHeight - 16,
    behavior: "instant",
  });
}

export function Catalog({
  amoProducts,
  home = false,
}: {
  amoProducts: AmoPilotProduct[];
  home?: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const defaultCategory = "packs";
  const requested = params.get("categoria") || defaultCategory;
  const active =
    catalogCategories.some((c) => c.id === requested) ||
    categories.some((c) => c.id === requested)
      ? requested
      : defaultCategory;
  const [search, setSearch] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressError, setAddressError] = useState("");
  const categoriesRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const categoryChanged = useRef(false);
  const { location, setLocation, openCart, items } = useCart();
  const priced = priceBasket(items);
  const query = normalizeSearch(search);
  const filtered = products.filter(
    (p) =>
      (active === "todos" ||
        p.category === active ||
        (active === "gelo-mixers" &&
          ["gelo", "mixers"].includes(p.category))) &&
      normalizeSearch(`${p.name} ${p.size}`).includes(query),
  );
  const featured = home && active === "todos" && !query;
  const visible = featured
    ? essentialIds.map((id) => productById.get(id)!)
    : home && !query
      ? filtered.slice(0, 8)
      : filtered;
  const amoMatches =
    amoProducts.length > 0 &&
    normalizeSearch(
      `Pack de descoberta A.M.O. Brewery cervejas artesanais ${amoProducts.map((p) => p.name).join(" ")}`,
    ).includes(query);
  const resultCount =
    active === "amo"
      ? Number(amoMatches)
      : active === "packs"
        ? packs.length
        : filtered.length;
  const title = query
    ? `Resultados para “${search}”`
    : featured
      ? "Os essenciais"
      : catalogCategories.find((c) => c.id === active)?.name ||
        categories.find((c) => c.id === active)?.name ||
        "Produtos";

  useEffect(() => {
    if (!params.has("categoria") && window.location.hash === "#amo") {
      const next = new URLSearchParams(params.toString());
      next.set("categoria", "amo");
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [params, pathname, router]);

  useEffect(() => {
    if (!categoryChanged.current || !resultsRef.current) return;
    categoryChanged.current = false;
    scrollToCatalogSection(resultsRef.current, home);
  }, [active, home]);

  function chooseCategory(id: string) {
    setSearch("");
    if (id === active) {
      scrollToCatalogSection(resultsRef.current, home);
      return;
    }
    categoryChanged.current = true;
    track("category_clicked", {
      category: id,
      source: home ? "landing" : "catalog",
    });
    const next = new URLSearchParams(params.toString());
    if (id === defaultCategory) next.delete("categoria");
    else next.set("categoria", id);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
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
    <div className="storefront">
      <header className="store-header">
        <div className="container store-nav">
          <Wordmark />
          <div className="store-search search-field">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Procurar produtos"
              placeholder="Procurar produtos"
              autoComplete="off"
              enterKeyHint="search"
              value={search}
              onChange={(event) => {
                if (active !== "todos" && active !== "amo")
                  chooseCategory("todos");
                setSearch(event.target.value);
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="Limpar pesquisa"
                onClick={() => setSearch("")}
              >
                <X size={17} />
              </button>
            )}
          </div>
          <button
            className="store-location"
            onClick={() => {
              setAddressError("");
              setAddressOpen(true);
            }}
          >
            <MapPin size={18} aria-hidden="true" />
            <span>{location?.city || "Escolher cidade"}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            className="store-cart"
            onClick={openCart}
            aria-label={`Ver carrinho, ${priced.item_count} ${priced.item_count === 1 ? "artigo" : "artigos"}`}
          >
            <ShoppingBag size={21} aria-hidden="true" />
            <span>{priced.item_count}</span>
          </button>
        </div>
      </header>
      <main id="main" className="container store-main">
        {home ? (
          <section
            className="store-intro"
            aria-label="Bebidas e essenciais Ruvon"
          >
            <div>
              <h1>
                Bebidas, gelo
                <br />e snacks.
              </h1>
            </div>
            <div className="store-intro-photo">
              <Image
                src="/images/ruvon-hero.webp"
                alt="Bebidas, gelo e snacks no saco Ruvon"
                width={1100}
                height={1100}
                preload
                sizes="(max-width: 700px) 48vw, 430px"
              />
            </div>
          </section>
        ) : (
          <h1 className="store-catalog-title">Escolhe o que falta.</h1>
        )}
        <section
          className="catalog-categories"
          aria-labelledby="catalog-categories-title"
          ref={categoriesRef}
          tabIndex={-1}
        >
          <h2 id="catalog-categories-title">Categorias</h2>
          <CategoryGallery
            active={
              ["gelo", "mixers"].includes(active) ? "gelo-mixers" : active
            }
            onSelect={chooseCategory}
          />
        </section>
        <section
          className="store-results"
          ref={resultsRef}
          aria-labelledby="store-results-title"
          tabIndex={-1}
        >
          <div className="store-results-heading">
            <h2 id="store-results-title">{title}</h2>
            <div className="catalog-heading-actions">
              {home &&
              active !== "packs" &&
              active !== "amo" &&
              filtered.length > visible.length ? (
                <Link
                  className="store-view-all"
                  href={`/pedir?categoria=${active}`}
                >
                  <span>Ver tudo</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : (
                <span
                  className="store-result-count"
                  role="status"
                  aria-live="polite"
                >
                  {resultCount}{" "}
                  {active === "packs" || active === "amo"
                    ? resultCount === 1
                      ? "pack"
                      : "packs"
                    : resultCount === 1
                      ? "produto"
                      : "produtos"}
                </span>
              )}
              <button
                type="button"
                onClick={() => scrollToCatalogSection(categoriesRef.current)}
              >
                Ver categorias
              </button>
            </div>
          </div>
          {active === "packs" ? (
            <PackBrowser compact />
          ) : active === "amo" ? (
            amoMatches && <AmoPilotCatalog products={amoProducts} />
          ) : (
            <div className="product-grid">
              {visible.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          )}
          {active !== "packs" && !resultCount && (
            <div className="search-empty">
              <h3>Sem resultados.</h3>
              <p>Experimenta outro nome.</p>
              <button
                className="button button-secondary"
                onClick={() => {
                  setSearch("");
                  if (active !== "amo") chooseCategory("todos");
                }}
              >
                Limpar pesquisa
              </button>
            </div>
          )}
          {home &&
            active !== "packs" &&
            active !== "amo" &&
            filtered.length > visible.length && (
              <Link className="store-more" href={`/pedir?categoria=${active}`}>
                Ver{" "}
                {featured
                  ? "todos os produtos"
                  : `mais ${filtered.length - visible.length} produtos`}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            )}
        </section>
        <div className="store-info" id="ajuda">
          <details>
            <summary>
              Como funciona
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <p>
              Escolhe os produtos e compõe o teu carrinho. No final, regista o
              teu interesse na tua cidade para receber avisos de
              disponibilidade. O registo não conclui uma compra e não exige
              pagamento.
            </p>
          </details>
          <MerchantAccess />
          <span>Para maiores de 18 anos.</span>
        </div>
      </main>
      <Footer compact />
      <Modal
        open={addressOpen}
        onOpenChange={setAddressOpen}
        title="A tua cidade"
        description="Seleciona a cidade onde tens interesse na Ruvon."
      >
        <form className="form-stack" onSubmit={saveAddress}>
          <label>
            Cidade
            <CitySelect defaultValue={location?.city || ""} />
          </label>
          {addressError && (
            <p role="alert" className="form-error">
              {addressError}
            </p>
          )}
          <button className="button button-primary">Guardar cidade</button>
        </form>
      </Modal>
    </div>
  );
}
