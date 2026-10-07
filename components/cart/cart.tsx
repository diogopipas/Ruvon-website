"use client";
import Link from "next/link";
import Image from "next/image";
import { PackOptionsPicker } from "@/components/packs/pack-options-picker";
import { basketPackEvents, configurePack, packOptions } from "@/lib/packs";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/providers";
import { Modal } from "@/components/ui/modal";
import { Quantity } from "./quantity";
import { getCatalogItem, productById } from "@/lib/products";
import { money, priceBasket } from "@/lib/pricing";
import { ProductArt } from "@/components/ui/product-art";
import { trackOnce } from "@/lib/analytics";
import { checkoutKey } from "@/lib/journey";
export function CartContents({
  review = false,
  editingDisabled = false,
}: {
  review?: boolean;
  editingDisabled?: boolean;
}) {
  const {
    items,
    ageConfirmed,
    closeCart,
    syncOrder,
    notify,
    storageError,
    updateOptions,
    sandbox,
  } = useCart();
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const retryInFlight = useRef(false);
  const router = useRouter();
  const priced = priceBasket(items);
  async function checkout() {
    if (inFlight.current || !ageConfirmed || !items.length) return;
    inFlight.current = true;
    setBusy(true);
    trackOnce(
      "checkout_started",
      {
        ...basketPackEvents(items),
        basket_value: priced.subtotal / 100,
        item_count: priced.item_count,
      },
      `checkout_started:${checkoutKey(items, false)}`,
    );
    try {
      await syncOrder(true);
    } catch {
      notify("Ligação instável. O teu carrinho fica guardado.");
    }
    inFlight.current = false;
    setBusy(false);
    closeCart();
    router.push("/checkout");
  }
  async function retry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    try {
      await syncOrder();
      notify("Carrinho guardado.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Ainda sem ligação. Tenta novamente.",
      );
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
  }
  if (!items.length)
    return (
      <div className="empty-cart">
        <div>
          <ShoppingBag size={34} strokeWidth={1.5} />
        </div>
        <h3>A noite ainda está em branco.</h3>
        <Link
          className="button button-primary"
          href="/pedir"
          onClick={closeCart}
        >
          Explorar a Ruvon
        </Link>
      </div>
    );
  return (
    <>
      <div className="cart-items">
        {items.map((item) => {
          const product = getCatalogItem(item.id)!;
          const art = productById.get(item.id);
          const configuration =
            "core" in product ? configurePack(product, item.options) : null;
          return (
            <div className="cart-item" key={item.id}>
              <div className="cart-item-art">
                {art ? (
                  <ProductArt product={art} />
                ) : "image" in product ? (
                  <Image
                    src={product.image}
                    alt=""
                    width={100}
                    height={100}
                    sizes="64px"
                  />
                ) : (
                  <ShoppingBag size={26} />
                )}
              </div>
              <div className="cart-item-info">
                <strong>{product.name}</strong>
                <small>
                  {"size" in product ? product.size : product.people}
                </small>
                {"people" in product && (
                  <>
                    <p className="cart-pack-summary">
                      {configuration?.core.join(" + ")}
                    </p>
                    <details className="cart-pack-edit">
                      <summary>Marcas e extras</summary>
                      <p className="cart-pack-summary">
                        {configuration?.extras.join(" · ") || "Sem extras."}
                      </p>
                      {item.quantity > 1 && (
                        <p className="pack-option-note">
                          Estas escolhas aplicam-se aos {item.quantity} packs.
                        </p>
                      )}
                      <PackOptionsPicker
                        pack={product}
                        value={packOptions(product, item.options)}
                        onChange={(options) => updateOptions(item.id, options)}
                        disabled={editingDisabled || busy}
                        source="cart"
                      />
                    </details>
                  </>
                )}
                <Quantity
                  id={item.id}
                  name={product.name}
                  compact
                  disabled={editingDisabled}
                />
              </div>
              <strong className="cart-item-price">
                {money((configuration?.price ?? product.price) * item.quantity)}
              </strong>
            </div>
          );
        })}
      </div>
      <div className="cart-totals">
        <div>
          <span>Subtotal</span>
          <span>{money(priced.subtotal)}</span>
        </div>
        <div>
          <span>Entrega</span>
          <span>{money(priced.delivery_fee)}</span>
        </div>
        <div>
          <span>Taxa Ruvon</span>
          <span>{money(priced.service_fee)}</span>
        </div>
        <div className="cart-total">
          <strong>Total estimado</strong>
          <strong data-testid="basket-total">{money(priced.total)}</strong>
        </div>
      </div>
      <div className="delivery-estimate"></div>
      <div className="cart-actions">
        {!review && (
          <button
            className="button button-primary checkout-button"
            onClick={checkout}
            disabled={busy || !ageConfirmed}
            aria-busy={busy}
          >
            {busy
              ? "A guardar o carrinho…"
              : sandbox
                ? "Continuar para MB WAY"
                : "Continuar para a minha zona"}
          </button>
        )}
        {storageError && (
          <p role="status" className="form-error">
            Ligação instável. O carrinho está guardado neste dispositivo.{" "}
            <button
              className="inline-button"
              disabled={retrying}
              onClick={retry}
            >
              {retrying ? "A guardar…" : "Tentar guardar"}
            </button>
          </p>
        )}
      </div>
    </>
  );
}
export function DesktopCart() {
  return (
    <aside className="desktop-cart">
      <div className="cart-heading">
        <h2>A tua noite</h2>
        <ShoppingBag size={21} />
      </div>
      <CartContents />
    </aside>
  );
}
export function CartLayer() {
  const { items, cartOpen, openCart, closeCart } = useCart();
  const pathname = usePathname();
  const priced = priceBasket(items);
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname === "/termos" ||
    pathname === "/privacidade"
  )
    return null;
  return (
    <>
      <Modal
        open={cartOpen}
        onOpenChange={(open) => {
          if (!open) closeCart();
        }}
        title="A tua noite"
        className="cart-modal"
      >
        <CartContents />
      </Modal>
      {items.length > 0 && (
        <button
          className={`floating-cart ${pathname === "/pedir" ? "catalog-floating" : ""}`}
          onClick={openCart}
        >
          <span className="cart-count">{priced.item_count}</span>
          <span>
            Ver carrinho <small>· {priced.item_count} artigos</small>
          </span>
          <strong>{money(priced.total)}</strong>
        </button>
      )}
    </>
  );
}
