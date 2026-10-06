"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Check, ShoppingBag } from "lucide-react";
import {
  attribution,
  captureAttribution,
  getSession,
  readLocal,
  track,
  trackOnce,
  writeLocal,
} from "@/lib/analytics";
import { getCatalogItem, packById } from "@/lib/products";
import { basketPackEvents, packEvent, packOptions } from "@/lib/packs";
import { priceBasket } from "@/lib/pricing";
import { cartSchema, locationSchema, type OrderInput } from "@/lib/validation";
import { Modal } from "@/components/ui/modal";
import { createLatestWriter, postJson } from "@/lib/client-request";
import { readJourney, writeJourney } from "@/lib/journey";
import type { CartItem, Location, PackOptions } from "@/types";
import { subtractPurchasedBasket } from "@/lib/payments";
type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  ageConfirmed: boolean;
  add: (id: string, options?: PackOptions) => void;
  updateOptions: (id: string, options: PackOptions) => void;
  remove: (id: string) => void;
  location: Location | null;
  setLocation: (location: Location) => void;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  notify: (message: string) => void;
  syncOrder: (checkout?: boolean, delivery?: Location) => Promise<void>;
  storageError: boolean;
  sandbox: boolean;
  clearPaidOrder: (orderId: string, purchased: CartItem[]) => void;
};
const CartContext = createContext<CartContextValue | null>(null);
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("CartProvider missing");
  return context;
}
export function Providers({
  children,
  sandbox = false,
}: {
  children: React.ReactNode;
  sandbox?: boolean;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [location, setDelivery] = useState<Location | null>(null);
  const [ready, setReady] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  const ageConfirmed = ready && !ageOpen && !denied;
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writeQueue = useRef<((payload: OrderInput) => Promise<void>) | null>(
    null,
  );
  const itemsRef = useRef<CartItem[]>([]);
  const locationRef = useRef<Location | null>(null);
  const allowedRef = useRef(false);
  const savedPayload = useRef("");
  const checkoutReached = useRef(false);
  const started = useRef(false);
  const paidOrders = useRef<string[]>([]);
  const persistCart = useCallback(
    (next: CartItem[]) => {
      if (sandbox)
        writeLocal("jola_sandbox_cart", {
          items: next,
          paidOrders: paidOrders.current,
        });
      else writeLocal("jola_cart", next);
    },
    [sandbox],
  );
  const clearPaidOrder = useCallback(
    (orderId: string, purchased: CartItem[]) => {
      if (!sandbox || paidOrders.current.includes(orderId)) return;
      paidOrders.current = [...paidOrders.current, orderId];
      const next = subtractPurchasedBasket(itemsRef.current, purchased);
      itemsRef.current = next;
      // Cart and receipt are one localStorage write, so a reload cannot subtract twice.
      persistCart(next);
      setItems(next);
    },
    [sandbox, persistCart],
  );
  useEffect(() => {
    captureAttribution();
    getSession();
    const saved = readLocal<{ items?: CartItem[]; paidOrders?: string[] }>(
      "jola_sandbox_cart",
      {},
    );
    paidOrders.current = Array.isArray(saved.paidOrders)
      ? saved.paidOrders.filter((id) => typeof id === "string")
      : [];
    const cart = cartSchema.safeParse(
      sandbox ? (saved.items ?? []) : readLocal("jola_cart", []),
    );
    const savedLocation = locationSchema.safeParse(
      readLocal("jola_location", null),
    );
    // Hydrate browser-persisted state once after the server render.
    itemsRef.current = cart.success ? cart.data : [];
    setItems(itemsRef.current);
    if (savedLocation.success) {
      locationRef.current = savedLocation.data;
      setDelivery(savedLocation.data);
      writeLocal("jola_location", savedLocation.data);
    }
    checkoutReached.current =
      readLocal<boolean>("jola_checkout_started", false) === true;
    started.current = !!cart.success && cart.data.length > 0;
    const refused = readJourney<boolean>("jola_age_denied", false) === true;
    allowedRef.current =
      readLocal<boolean>("jola_age", false) === true && !refused;
    setDenied(refused);
    setAgeOpen(!allowedRef.current);
    setReady(true);
  }, [sandbox]);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2400);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const syncOrder = useCallback(
    (checkout = false, delivery?: Location) => {
      if (sandbox) return Promise.resolve();
      if (!allowedRef.current) return Promise.resolve();
      if (checkout) {
        checkoutReached.current = true;
        writeLocal("jola_checkout_started", true);
      }
      if (delivery) locationRef.current = delivery;
      if (!writeQueue.current)
        writeQueue.current = createLatestWriter<OrderInput>(async (payload) => {
          const signature = JSON.stringify(payload);
          if (signature === savedPayload.current) return;
          try {
            await postJson("/api/orders", payload);
            savedPayload.current = signature;
            setStorageError(false);
          } catch (error) {
            savedPayload.current = "";
            setStorageError(true);
            throw error;
          }
        });
      return writeQueue.current({
        session_id: getSession(),
        items: itemsRef.current,
        location: locationRef.current ?? undefined,
        attribution: attribution(),
        reached_checkout: checkoutReached.current,
      });
    },
    [sandbox],
  );
  useEffect(() => {
    if (!ageConfirmed) return;
    persistCart(items);
    if (!started.current && !items.length) return;
    started.current = true;
    const timeout = setTimeout(() => {
      void syncOrder().catch(() => undefined);
    }, 350);
    return () => clearTimeout(timeout);
  }, [items, location, ageConfirmed, syncOrder, persistCart]);
  const add = (id: string, options?: PackOptions) => {
    const product = getCatalogItem(id);
    if (!allowedRef.current || !product) return;
    const currentItems = itemsRef.current;
    const current = currentItems.find((i) => i.id === id);
    if ((current?.quantity ?? 0) >= 30) {
      notify("Máximo de 30 por artigo.");
      return;
    }
    const pack = packById.get(id);
    const selected = pack
      ? packOptions(pack, options ?? current?.options)
      : undefined;
    const next = current
      ? currentItems.map((i) =>
          i.id === id
            ? {
                ...i,
                quantity: i.quantity + 1,
                ...(pack ? { options: selected } : {}),
              }
            : i,
        )
      : [
          ...currentItems,
          { id, quantity: 1, ...(pack ? { options: selected } : {}) },
        ];
    itemsRef.current = next;
    setItems(next);
    persistCart(next);
    const priced = priceBasket(next);
    if (pack)
      trackOnce(
        "product_viewed",
        { ...packEvent(id, selected), product: id, category: "packs" },
        `product_viewed:${id}`,
      );
    track("product_added", {
      ...packEvent(id, selected),
      after_pack: !pack && currentItems.some((item) => packById.has(item.id)),
      product: id,
      category: "category" in product ? product.category : "packs",
      basket_value: priced.subtotal / 100,
      item_count: priced.item_count,
      quantity: 1,
    });
    notify(`${product.name} no carrinho`);
  };
  const remove = (id: string) => {
    if (!allowedRef.current || !itemsRef.current.some((item) => item.id === id))
      return;
    const previous = itemsRef.current.find((item) => item.id === id);
    const next = itemsRef.current.flatMap((i) =>
      i.id !== id
        ? [i]
        : i.quantity > 1
          ? [{ ...i, quantity: i.quantity - 1 }]
          : [],
    );
    itemsRef.current = next;
    setItems(next);
    persistCart(next);
    const product = getCatalogItem(id);
    const priced = priceBasket(next);
    track("product_removed", {
      ...packEvent(id, previous?.options),
      product: id,
      category: product && "category" in product ? product.category : "packs",
      basket_value: priced.subtotal / 100,
      item_count: priced.item_count,
      quantity: 1,
    });
  };
  const updateOptions = (id: string, options: PackOptions) => {
    const pack = packById.get(id);
    if (
      !allowedRef.current ||
      !pack ||
      !itemsRef.current.some((item) => item.id === id)
    )
      return;
    const selected = packOptions(pack, options);
    const next = itemsRef.current.map((item) =>
      item.id === id ? { ...item, options: selected } : item,
    );
    itemsRef.current = next;
    setItems(next);
    persistCart(next);
    // Individual changes are tracked by the shared picker, including detail drafts.
    notify("Pack atualizado.");
  };
  const setLocation = (value: Location) => {
    if (!allowedRef.current) return;
    locationRef.current = value;
    setDelivery(value);
    writeLocal("jola_location", value);
  };
  const openCart = () => {
    if (!allowedRef.current) return;
    const priced = priceBasket(itemsRef.current);
    track("cart_opened", {
      ...basketPackEvents(itemsRef.current),
      basket_value: priced.subtotal / 100,
      item_count: priced.item_count,
    });
    setCartOpen(true);
  };
  const isPrivate =
    pathname.startsWith("/admin") ||
    pathname === "/privacidade" ||
    pathname === "/termos";
  return (
    <CartContext.Provider
      value={{
        items,
        ready,
        ageConfirmed,
        add,
        updateOptions,
        remove,
        location,
        setLocation,
        cartOpen,
        openCart,
        closeCart: () => setCartOpen(false),
        notify,
        syncOrder,
        storageError,
        sandbox,
        clearPaidOrder,
      }}
    >
      {children}
      <Modal
        open={ready && ageOpen && !isPrivate}
        onOpenChange={() => {}}
        title={denied ? "Ficamos por aqui." : "Só uma coisa…"}
        locked
        className="age-modal"
      >
        <div className="age-emblem" aria-hidden="true">
          {denied ? "—" : "18+"}
        </div>
        <h2>
          {denied
            ? "Esta noite é para maiores de 18."
            : "Tens 18 anos ou mais?"}
        </h2>
        <p>
          {denied
            ? "A Jola destina-se a adultos. Não podes continuar para o catálogo."
            : "Boas noites, com responsabilidade. Confirma a tua idade para entrares."}
        </p>
        {!denied ? (
          <>
            <button
              className="button button-primary"
              onClick={() => {
                writeLocal("jola_age", true);
                writeJourney("jola_age_denied", false);
                allowedRef.current = true;
                setAgeOpen(false);
              }}
            >
              Sim, tenho 18+ <Check size={18} />
            </button>
            <button
              className="button button-quiet"
              onClick={() => {
                allowedRef.current = false;
                writeJourney("jola_age_denied", true);
                setDenied(true);
              }}
            >
              Não
            </button>
          </>
        ) : (
          <button
            className="button button-secondary"
            onClick={() => setDenied(false)}
          >
            Voltar à confirmação
          </button>
        )}
      </Modal>
      {toast && (
        <div role="status" className="toast">
          <ShoppingBag size={17} />
          {toast}
        </div>
      )}
    </CartContext.Provider>
  );
}
