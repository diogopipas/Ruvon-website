"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Clock3, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/providers";
import { Modal } from "@/components/ui/modal";
import { Quantity } from "./quantity";
import { getCatalogItem, productById } from "@/lib/products";
import { money, priceBasket } from "@/lib/pricing";
import { ProductArt } from "@/components/ui/product-art";
import { track } from "@/lib/analytics";
export function CartContents({ review = false }: { review?: boolean }) {
  const { items, closeCart, syncOrder, notify, storageError } = useCart();
  const router = useRouter();
  const priced = priceBasket(items);
  async function checkout() {
    track("checkout_started", {
      basket_value: priced.subtotal / 100,
      item_count: priced.item_count,
    });
    try {
      await syncOrder(true);
    } catch {
      notify("Ligação instável. O teu carrinho fica guardado.");
    }
    closeCart();
    router.push("/checkout");
  }
  if (!items.length)
    return (
      <div className="empty-cart">
        <div>
          <ShoppingBag size={34} strokeWidth={1.5} />
        </div>
        <h3>A noite ainda está em branco.</h3>
        <p>
          Junta o que falta.
          <br />
          Nós guardamos-te o lugar.
        </p>
        <Link
          className="button button-primary"
          href="/pedir"
          onClick={closeCart}
        >
          Explorar a Jola
          <ArrowUpRight size={18} />
        </Link>
      </div>
    );
  return (
    <>
      <div className="cart-items">
        {items.map((item) => {
          const product = getCatalogItem(item.id)!;
          const art = productById.get(item.id);
          return (
            <div className="cart-item" key={item.id}>
              <div className="cart-item-art">
                {art ? <ProductArt product={art} /> : <ShoppingBag size={26} />}
              </div>
              <div className="cart-item-info">
                <strong>{product.name}</strong>
                <small>
                  {"size" in product ? product.size : product.people}
                </small>
                <Quantity id={item.id} name={product.name} compact />
              </div>
              <strong className="cart-item-price">
                {money(product.price * item.quantity)}
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
          <span>Taxa Jola</span>
          <span>{money(priced.service_fee)}</span>
        </div>
        <div className="cart-total">
          <strong>Total estimado</strong>
          <strong data-testid="basket-total">{money(priced.total)}</strong>
        </div>
      </div>
      <div className="delivery-estimate">
        <Clock3 size={15} />
        <span>Entrega estimada: 22–32 min*</span>
      </div>
      {!review && (
        <button
          className="button button-primary checkout-button"
          onClick={checkout}
        >
          Continuar
          <ArrowRight size={18} />
        </button>
      )}
      <p className="cart-disclaimer">
        Simulação. Sem pagamento.
        <br />* Estimativa para o futuro lançamento.
      </p>
      {storageError && (
        <p role="status" className="form-error">
          Ligação instável. O carrinho está guardado neste dispositivo.{" "}
          <button
            className="inline-button"
            onClick={() =>
              void syncOrder().catch(() =>
                notify("Ainda sem ligação. Tenta novamente."),
              )
            }
          >
            Tentar guardar
          </button>
        </p>
      )}
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
          <ArrowRight size={18} />
        </button>
      )}
    </>
  );
}
