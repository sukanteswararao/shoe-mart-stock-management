"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

// Size Groups
const SIZE_GROUPS = {
  CHILDRENS: ["M1", "M2", "M3", "M4", "M5"],
  KIDS: ["K5", "K6", "K7", "K8", "K9", "K10", "K11", "K12", "K13"],
  ADULT: ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14"],
};

const ALL_SIZES = [
  ...SIZE_GROUPS.CHILDRENS,
  ...SIZE_GROUPS.KIDS,
  ...SIZE_GROUPS.ADULT,
];

// Target WhatsApp number with country code (91)
const TARGET_WHATSAPP_NUMBER = "919999999999";

type Product = {
  id: string;
  company: string;
  brand: string;
  model: string;
  article: string;
  category: string;
  colour: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: Record<string, number>;
  sold: Record<string, number>;
  photoUrl?: string;
};

type Sale = {
  id: string;
  productId?: string;
  productName: string;
  article: string;
  size: string;
  quantity: number;
  price: number;
  date: string;
  createdAt: string;
};

type Sheet = "Equal Sheet" | "Plus Sheet" | "Minus Sheet" | "Sales History" | "Reports";

const initialStockForm = Object.fromEntries(ALL_SIZES.map((size) => [size, "0"]));

const blankForm = {
  company: "",
  brand: "",
  model: "",
  article: "",
  category: "Slippers",
  colour: "",
  purchasePrice: "",
  sellingPrice: "",
  stock: initialStockForm,
};

export default function Home() {
  const [sheet, setSheet] = useState<Sheet>("Equal Sheet");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);
  const [activeSizeFilter, setActiveSizeFilter] = useState<"ALL" | "CHILDRENS" | "KIDS" | "ADULT">("ADULT");
  const [saleId, setSaleId] = useState("");
  const [saleSize, setSaleSize] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  // Sales Editing Modal State
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editSaleQty, setEditSaleQty] = useState("1");
  const [editSalePrice, setEditSalePrice] = useState("0");

  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    try {
      setLoading(true);

      const { data: dbProducts, error: prodErr } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: dbSales, error: salesErr } = await supabase
        .from("sales")
        .select("*")
        .order("created_at", { ascending: false });

      if (prodErr || salesErr) {
        console.error("Supabase load error:", prodErr || salesErr);
        setMessage("Unable to connect to cloud database. Please verify internet.");
        return;
      }

      const formattedProducts: Product[] = (dbProducts || []).map((p: any) => {
        const sizesData = p.sizes_stock || {};
        return {
          id: p.id,
          company: p.company_name,
          brand: p.brand_name,
          model: p.model_number,
          article: p.article_number,
          category: p.category,
          colour: p.colour,
          purchasePrice: Number(p.purchase_price),
          sellingPrice: Number(p.selling_price),
          stock: sizesData.stock || {},
          sold: sizesData.sold || {},
          photoUrl: p.photo_url || "",
        };
      });

      const formattedSales: Sale[] = (dbSales || []).map((s: any) => ({
        id: s.id,
        productId: s.product_id,
        productName: s.product_name,
        article: s.article_number,
        size: s.size,
        quantity: Number(s.quantity),
        price: Number(s.selling_price),
        date: new Date(s.created_at).toLocaleString(),
        createdAt: s.created_at,
      }));

      setProducts(formattedProducts);
      setSales(formattedSales);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("shoe-mart-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalPairs = products.reduce(
    (sum, p) => sum + ALL_SIZES.reduce((n, size) => n + (p.stock[size] || 0), 0),
    0
  );

  const availablePairs = products.reduce(
    (sum, p) =>
      sum +
      ALL_SIZES.reduce(
        (n, size) => n + (p.stock[size] || 0) - (p.sold[size] || 0),
        0
      ),
    0
  );

  const soldPairs = products.reduce(
    (sum, p) => sum + ALL_SIZES.reduce((n, size) => n + (p.sold[size] || 0), 0),
    0
  );

  const revenue = sales.reduce(
    (sum, sale) => sum + sale.quantity * sale.price,
    0
  );

  const filteredProducts = products.filter((p) =>
    [p.company, p.brand, p.model, p.article, p.category, p.colour]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("slippers-photos")
        .upload(filePath, file);

      if (uploadError) {
        setMessage(`Upload error: ${uploadError.message}`);
        return;
      }

      const { data } = supabase.storage
        .from("slippers-photos")
        .getPublicUrl(filePath);

      setPreviewUrl(data.publicUrl);
      setMessage("Product photo attached successfully!");
    } catch (err: any) {
      setMessage(`Image upload failed: ${err.message}`);
    } finally {
      setUploadingImage(false);
    }
  }

  async function saveProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const quantities = Object.fromEntries(
      ALL_SIZES.map((size) => [size, Number(form.stock[size] || 0)])
    ) as Record<string, number>;

    if (
      !form.company.trim() ||
      !form.model.trim() ||
      !form.article.trim() ||
      !form.colour.trim() ||
      !form.purchasePrice ||
      !form.sellingPrice ||
      Number(form.purchasePrice) < 0 ||
      Number(form.sellingPrice) < 0 ||
      !ALL_SIZES.some((size) => quantities[size] > 0)
    ) {
      setMessage("Please fill all required details and enter stock for at least one size.");
      return;
    }

    if (editId !== null) {
      const existing = products.find((p) => p.id === editId);
      if (!existing) return;

      const { error } = await supabase
        .from("products")
        .update({
          company_name: form.company.trim(),
          brand_name: form.brand.trim(),
          model_number: form.model.trim(),
          article_number: form.article.trim(),
          category: form.category,
          colour: form.colour.trim(),
          purchase_price: Number(form.purchasePrice),
          selling_price: Number(form.sellingPrice),
          photo_url: previewUrl || existing.photoUrl || "",
          sizes_stock: { stock: quantities, sold: existing.sold },
        })
        .eq("id", editId);

      if (error) {
        setMessage(`Update error: ${error.message}`);
        return;
      }

      setEditId(null);
      setMessage("Product updated in cloud inventory!");
    } else {
      const duplicate = products.some(
        (p) =>
          p.article.toLowerCase() === form.article.trim().toLowerCase() &&
          p.colour.toLowerCase() === form.colour.trim().toLowerCase() &&
          p.model.toLowerCase() === form.model.trim().toLowerCase()
      );

      if (duplicate) {
        setMessage("An item with this model, article, and colour already exists.");
        return;
      }

      const emptySold = Object.fromEntries(ALL_SIZES.map((size) => [size, 0]));

      const { error } = await supabase.from("products").insert({
        company_name: form.company.trim(),
        brand_name: form.brand.trim(),
        model_number: form.model.trim(),
        article_number: form.article.trim(),
        category: form.category,
        colour: form.colour.trim(),
        purchase_price: Number(form.purchasePrice),
        selling_price: Number(form.sellingPrice),
        photo_url: previewUrl,
        sizes_stock: { stock: quantities, sold: emptySold },
      });

      if (error) {
        setMessage(`Save error: ${error.message}`);
        return;
      }

      setMessage("New footwear product committed to cloud database!");
    }

    setForm(blankForm);
    setPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadData();
  }

  function editProduct(p: Product) {
    const stock = Object.fromEntries(
      ALL_SIZES.map((size) => [size, String(p.stock[size] || 0)])
    );

    setForm({
      company: p.company,
      brand: p.brand,
      model: p.model,
      article: p.article,
      category: p.category,
      colour: p.colour,
      purchasePrice: String(p.purchasePrice),
      sellingPrice: String(p.sellingPrice),
      stock,
    });

    setPreviewUrl(p.photoUrl || "");
    setEditId(p.id);
    setSheet("Plus Sheet");
    setMessage("Editing product details.");
  }

  async function deleteProduct(p: Product) {
    if (!window.confirm(`Are you sure you want to delete ${p.model} (${p.article})?`)) {
      return;
    }

    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) {
      setMessage(`Delete failed: ${error.message}`);
      return;
    }

    setMessage("Product deleted from cloud.");
    await loadData();
  }

  async function recordSale(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const product = products.find((p) => p.id === saleId);
    const quantity = Number(saleQty);

    if (!product || !saleSize || quantity < 1) {
      setMessage("Please select a valid product, size, and quantity.");
      return;
    }

    const available = (product.stock[saleSize] || 0) - (product.sold[saleSize] || 0);

    if (quantity > available) {
      setMessage(`Size ${saleSize} has only ${available} pairs in stock.`);
      return;
    }

    const updatedSold = {
      ...product.sold,
      [saleSize]: (product.sold[saleSize] || 0) + quantity,
    };

    const { error: saleErr } = await supabase.from("sales").insert({
      product_id: product.id,
      product_name: product.model,
      article_number: product.article,
      size: saleSize,
      quantity,
      selling_price: product.sellingPrice,
      total_amount: quantity * product.sellingPrice,
    });

    if (saleErr) {
      setMessage(`Sale recording failed: ${saleErr.message}`);
      return;
    }

    const { error: prodErr } = await supabase
      .from("products")
      .update({
        sizes_stock: { stock: product.stock, sold: updatedSold },
      })
      .eq("id", product.id);

    if (prodErr) {
      setMessage(`Stock adjustment error: ${prodErr.message}`);
      return;
    }

    setSaleQty("1");
    setMessage(`Sale logged: Size ${saleSize} (${quantity} pairs). Synced across all devices!`);
    await loadData();
  }

  // --- SALES HISTORY: DELETE ACTION WITH REVERSED STOCK ---
  async function deleteSale(sale: Sale) {
    if (
      !window.confirm(
        `Delete sale of ${sale.productName} (Size ${sale.size}, ${sale.quantity} pairs)? Stock will be restored.`
      )
    ) {
      return;
    }

    try {
      // 1. Delete from sales table
      const { error: delErr } = await supabase
        .from("sales")
        .delete()
        .eq("id", sale.id);

      if (delErr) {
        setMessage(`Error deleting sale: ${delErr.message}`);
        return;
      }

      // 2. Restore stock back to the product
      const product = products.find(
        (p) => p.id === sale.productId || p.article === sale.article
      );

      if (product) {
        const currentSold = product.sold[sale.size] || 0;
        const newSold = Math.max(0, currentSold - sale.quantity);

        const updatedSold = {
          ...product.sold,
          [sale.size]: newSold,
        };

        await supabase
          .from("products")
          .update({
            sizes_stock: { stock: product.stock, sold: updatedSold },
          })
          .eq("id", product.id);
      }

      setMessage(`Sale record deleted. Stock restored (+${sale.quantity} pairs of Size ${sale.size}).`);
      await loadData();
    } catch (err: any) {
      setMessage(`Delete failed: ${err.message}`);
    }
  }

  // --- SALES HISTORY: OPEN EDIT MODAL ---
  function openEditSaleModal(sale: Sale) {
    setEditingSale(sale);
    setEditSaleQty(String(sale.quantity));
    setEditSalePrice(String(sale.price));
  }

  // --- SALES HISTORY: SAVE EDITED SALE WITH STOCK ADJUSTMENT ---
  async function handleSaveEditedSale(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSale) return;

    const newQty = Number(editSaleQty);
    const newPrice = Number(editSalePrice);

    if (newQty < 1 || newPrice < 0) {
      setMessage("Please enter a valid quantity and selling price.");
      return;
    }

    try {
      const product = products.find(
        (p) => p.id === editingSale.productId || p.article === editingSale.article
      );

      const qtyDifference = newQty - editingSale.quantity;

      if (product && qtyDifference > 0) {
        const currentAvailable =
          (product.stock[editingSale.size] || 0) -
          (product.sold[editingSale.size] || 0);

        if (qtyDifference > currentAvailable) {
          setMessage(
            `Cannot increase quantity by ${qtyDifference}. Only ${currentAvailable} more pairs available in Size ${editingSale.size}.`
          );
          return;
        }
      }

      // 1. Update the sales row in Supabase
      const { error: saleUpdErr } = await supabase
        .from("sales")
        .update({
          quantity: newQty,
          selling_price: newPrice,
          total_amount: newQty * newPrice,
        })
        .eq("id", editingSale.id);

      if (saleUpdErr) {
        setMessage(`Error updating sale: ${saleUpdErr.message}`);
        return;
      }

      // 2. Adjust product sold numbers
      if (product && qtyDifference !== 0) {
        const currentSold = product.sold[editingSale.size] || 0;
        const updatedSold = {
          ...product.sold,
          [editingSale.size]: Math.max(0, currentSold + qtyDifference),
        };

        await supabase
          .from("products")
          .update({
            sizes_stock: { stock: product.stock, sold: updatedSold },
          })
          .eq("id", product.id);
      }

      setMessage("Sale transaction updated and stock balance reconciled!");
      setEditingSale(null);
      await loadData();
    } catch (err: any) {
      setMessage(`Update failed: ${err.message}`);
    }
  }

  // Single-Click WhatsApp Sales Report Generator
  function sendWhatsAppReport(days: number | "ALL") {
    let filteredSales = sales;
    let periodTitle = "All-Time Sales Report";

    if (days !== "ALL") {
      const cutOff = new Date();
      cutOff.setDate(cutOff.getDate() - days);
      filteredSales = sales.filter((s) => new Date(s.createdAt) >= cutOff);

      if (days === 7) periodTitle = "Last 7 Days Sales Report";
      else if (days === 30) periodTitle = "Last 30 Days Sales Report";
      else if (days === 365) periodTitle = "Last 1 Year Sales Report";
    }

    if (filteredSales.length === 0) {
      alert("No sales recorded for the selected time period.");
      return;
    }

    const productStats: Record<string, { name: string; article: string; pairs: number; totalAmt: number }> = {};
    let totalRevenue = 0;
    let totalUnits = 0;

    filteredSales.forEach((s) => {
      const key = `${s.productName}-${s.article}`;
      if (!productStats[key]) {
        productStats[key] = { name: s.productName, article: s.article, pairs: 0, totalAmt: 0 };
      }
      productStats[key].pairs += s.quantity;
      productStats[key].totalAmt += s.quantity * s.price;
      totalUnits += s.quantity;
      totalRevenue += s.quantity * s.price;
    });

    const topSelling = Object.values(productStats).sort((a, b) => b.pairs - a.pairs);

    let text = `👞 *Shoe Mart - ${periodTitle}*\n`;
    text += `📅 Date: ${new Date().toLocaleDateString("en-IN")}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📦 Total Pairs Sold: *${totalUnits} Pairs*\n`;
    text += `💰 Total Collection: *₹${totalRevenue.toLocaleString("en-IN")}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `🔥 *Top Selling Products:*\n`;

    topSelling.slice(0, 15).forEach((item, index) => {
      text += `${index + 1}. *${item.name}* (${item.article})\n   ↳ Sold: *${item.pairs} pairs* | Total: ₹${item.totalAmt}\n`;
    });

    text += `\n📊 _Shoe Mart Live Cloud Stock System_`;

    const encoded = encodeURIComponent(text);
    const url = `https://wa.me/${TARGET_WHATSAPP_NUMBER}?text=${encoded}`;
    window.open(url, "_blank");
  }

  function exportCSV() {
    const rows = [
      [
        "Company", "Brand", "Model", "Article", "Category", "Colour",
        "Size", "Stock", "Sold", "Available", "Purchase Price", "Selling Price",
      ],
    ];

    products.forEach((p) => {
      ALL_SIZES.forEach((size) => {
        const stock = p.stock[size] || 0;
        const sold = p.sold[size] || 0;
        if (stock > 0 || sold > 0) {
          rows.push([
            p.company,
            p.brand,
            p.model,
            p.article,
            p.category,
            p.colour,
            size,
            String(stock),
            String(sold),
            String(stock - sold),
            String(p.purchasePrice),
            String(p.sellingPrice),
          ]);
        }
      });
    });

    const csv = rows
      .map((row) =>
        row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shoe-mart-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const sizesToDisplayInForm =
    activeSizeFilter === "CHILDRENS"
      ? SIZE_GROUPS.CHILDRENS
      : activeSizeFilter === "KIDS"
      ? SIZE_GROUPS.KIDS
      : activeSizeFilter === "ADULT"
      ? SIZE_GROUPS.ADULT
      : ALL_SIZES;

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-900 focus:outline-none";
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased font-sans">
      {/* Brand Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 px-6 py-4 shadow-md backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-black text-white">
              SM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Shoe Mart</h1>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                  Retail ERP
                </span>
              </div>
              <p className="text-xs text-slate-400">Inventory & Cloud Point of Sale</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-3.5 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-emerald-300">Live Sync</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-700 shadow-sm animate-pulse">
            Syncing catalog and latest branch transactions...
          </div>
        )}

        {/* Top Metric Cards */}
        <section className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
          {[
            { label: "Total Pairs In Stock", val: `${totalPairs} pairs`, sub: "Physical Catalog", color: "text-slate-900" },
            { label: "Units Sold", val: `${soldPairs} pairs`, sub: "Historical Total", color: "text-blue-600" },
            { label: "Pairs Available", val: `${availablePairs} pairs`, sub: "Ready for Sale", color: "text-emerald-600" },
            { label: "Gross Revenue", val: `₹${revenue.toLocaleString("en-IN")}`, sub: "Logged Transactions", color: "text-indigo-600" },
          ].map((card, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
              <p className={`mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight ${card.color}`}>{card.val}</p>
              <p className="mt-1 text-[11px] text-slate-400 font-medium">{card.sub}</p>
            </div>
          ))}
        </section>

        {/* Navigation Sheet Tabs */}
        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {(["Equal Sheet", "Plus Sheet", "Minus Sheet", "Sales History", "Reports"] as Sheet[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setSheet(tab);
                  setMessage("");
                }}
                className={`rounded-xl py-3 px-3 text-xs sm:text-sm font-bold transition-all ${
                  sheet === tab
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab === "Equal Sheet" && "📊 Equal Sheet"}
                {tab === "Plus Sheet" && "➕ Plus Sheet"}
                {tab === "Minus Sheet" && "➖ Minus Sheet"}
                {tab === "Sales History" && "📜 Sales History"}
                {tab === "Reports" && "📲 WhatsApp Reports"}
              </button>
            ))}
          </div>
        </section>

        {/* PLUS SHEET: Product & Stock Addition */}
        {sheet === "Plus Sheet" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                {editId !== null ? "Edit Footwear Product" : "Add New Footwear Stock"}
              </h2>
              <p className="text-xs text-slate-500">Configure catalog specifications, pricing, and size quantities.</p>
            </div>

            <form onSubmit={saveProduct} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["company", "Company / Manufacturer"],
                  ["brand", "Brand Name (Optional)"],
                  ["model", "Model Name / Series"],
                  ["article", "Article Number"],
                  ["colour", "Colour"],
                  ["purchasePrice", "Purchase Cost (₹)"],
                  ["sellingPrice", "Retail Selling Price (₹)"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className={labelClass}>{label}</label>
                    <input
                      className={inputClass}
                      value={form[key]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      type={key === "purchasePrice" || key === "sellingPrice" ? "number" : "text"}
                      required={key !== "brand"}
                    />
                  </div>
                ))}

                <div>
                  <label className={labelClass}>Product Category</label>
                  <select
                    className={inputClass}
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option>Slippers</option>
                    <option>Sandals</option>
                    <option>Shoes</option>
                    <option>Kids Footwear</option>
                    <option>Other</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>Footwear Photo (Camera or Files)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:font-semibold file:text-slate-700"
                  />
                  {uploadingImage && <p className="text-xs text-blue-600 mt-1 font-semibold">Uploading photo to cloud...</p>}
                  {previewUrl && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <img src={previewUrl} alt="Preview" className="h-14 w-14 rounded-lg object-cover border" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Photo attached</p>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewUrl("");
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="text-xs text-red-600 font-bold hover:underline"
                        >
                          Remove Photo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Size Selection Tabs */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-700">Size Quantities Matrix</h3>
                    <p className="text-xs text-slate-500">Selected size group will display below for quick quantity entry.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSizeFilter("CHILDRENS")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        activeSizeFilter === "CHILDRENS" ? "bg-blue-600 text-white" : "bg-white border text-slate-700"
                      }`}
                    >
                      Childrens (M1 to M5)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSizeFilter("KIDS")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        activeSizeFilter === "KIDS" ? "bg-blue-600 text-white" : "bg-white border text-slate-700"
                      }`}
                    >
                      Kids (K5 to K13)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSizeFilter("ADULT")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        activeSizeFilter === "ADULT" ? "bg-blue-600 text-white" : "bg-white border text-slate-700"
                      }`}
                    >
                      Ladies & Gents (5 to 14)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSizeFilter("ALL")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        activeSizeFilter === "ALL" ? "bg-slate-900 text-white" : "bg-white border text-slate-700"
                      }`}
                    >
                      All Sizes
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-10">
                  {sizesToDisplayInForm.map((size) => (
                    <div key={size} className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                      <span className="block text-xs font-bold text-slate-700 mb-1">Size {size}</span>
                      <input
                        className="w-full text-center rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-sm font-bold text-slate-900"
                        type="number"
                        min="0"
                        value={form.stock[size] ?? "0"}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            stock: { ...p.stock, [size]: e.target.value },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700"
                >
                  {editId !== null ? "Save Changes" : "Commit Product to Cloud"}
                </button>
                {editId !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(null);
                      setForm(blankForm);
                    }}
                    className="rounded-xl border bg-white px-5 py-3 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        {/* MINUS SHEET: Point of Sale */}
        {sheet === "Minus Sheet" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Record Footwear Sale</h2>
              <p className="text-xs text-slate-500">Deduct units and automatically post sales transaction data.</p>
            </div>

            {products.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No active stock available. Add items in Plus Sheet first.</p>
            ) : (
              <form onSubmit={recordSale} className="max-w-xl space-y-4">
                <div>
                  <label className={labelClass}>Choose Product</label>
                  <select
                    className={inputClass}
                    value={saleId}
                    onChange={(e) => {
                      setSaleId(e.target.value);
                      setSaleSize("");
                    }}
                    required
                  >
                    <option value="">-- Select Product From Stock --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.company} {p.model} (Art: {p.article}, {p.colour})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Available Size</label>
                  <select
                    className={inputClass}
                    value={saleSize}
                    onChange={(e) => setSaleSize(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Size --</option>
                    {ALL_SIZES.map((size) => {
                      const p = products.find((item) => item.id === saleId);
                      const stock = p?.stock[size] || 0;
                      const sold = p?.sold[size] || 0;
                      const available = stock - sold;

                      if (stock === 0 && sold === 0) return null;

                      return (
                        <option key={size} value={size}>
                          Size {size} — ({available} pairs available)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Units Sold</label>
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    value={saleQty}
                    onChange={(e) => setSaleQty(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white hover:bg-orange-700"
                >
                  Record Sale & Update Stock
                </button>
              </form>
            )}
          </section>
        )}

        {/* EQUAL SHEET: Stock Table */}
        {sheet === "Equal Sheet" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <input
                className={inputClass}
                placeholder="Filter by company, model, article, colour..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                onClick={exportCSV}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
              >
                Export Excel CSV
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b text-slate-500 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="p-3">Photo</th>
                      <th className="p-3">Footwear Details</th>
                      <th className="p-3">Article</th>
                      <th className="p-3">Size</th>
                      <th className="p-3 text-center">Stock</th>
                      <th className="p-3 text-center">Sold</th>
                      <th className="p-3 text-center">Available</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                          No matching footwear inventory located.
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.flatMap((p) => {
                        const activeSizes = ALL_SIZES.filter(
                          (size) => (p.stock[size] || 0) > 0 || (p.sold[size] || 0) > 0
                        );
                        const displaySizes = activeSizes.length > 0 ? activeSizes : [ALL_SIZES[0]];

                        return displaySizes.map((size, idx) => {
                          const stock = p.stock[size] || 0;
                          const sold = p.sold[size] || 0;
                          const available = stock - sold;

                          return (
                            <tr key={`${p.id}-${size}`} className="hover:bg-slate-50">
                              <td className="p-3">
                                {idx === 0 && (
                                  p.photoUrl ? (
                                    <img src={p.photoUrl} alt={p.model} className="h-11 w-11 rounded-lg object-cover border" />
                                  ) : (
                                    <div className="h-11 w-11 rounded-lg bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 border border-dashed">
                                      NO PIC
                                    </div>
                                  )
                                )}
                              </td>
                              <td className="p-3">
                                <span className="font-bold text-slate-900 block">{p.company} {p.model}</span>
                                <span className="text-[11px] text-slate-500">{p.category} · {p.colour}</span>
                              </td>
                              <td className="p-3 font-mono font-semibold">{p.article}</td>
                              <td className="p-3 font-bold text-blue-700">Size {size}</td>
                              <td className="p-3 text-center text-slate-600">{stock}</td>
                              <td className="p-3 text-center text-slate-600">{sold}</td>
                              <td className="p-3 text-center font-black text-slate-900 text-sm">{available}</td>
                              <td className="p-3">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                    available === 0 ? "bg-red-100 text-red-700" : available <= 3 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {available === 0 ? "Out of Stock" : available <= 3 ? "Low Stock" : "In Stock"}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                {idx === 0 && (
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => editProduct(p)}
                                      className="rounded-lg border bg-white px-2.5 py-1 text-xs font-bold hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteProduct(p)}
                                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-100"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* SALES HISTORY: FULL EDIT & DELETE CAPABILITIES */}
        {sheet === "Sales History" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Sales Transaction History</h2>
              <p className="text-xs text-slate-500">
                Manage all recorded sales. Editing quantity or deleting transactions will automatically adjust stock.
              </p>
            </div>

            {sales.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No transactions recorded in the sales ledger yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Article</th>
                      <th className="p-3">Size</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Total (₹)</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-500">{s.date}</td>
                        <td className="p-3 font-bold text-slate-900">{s.productName}</td>
                        <td className="p-3 font-mono text-slate-700">{s.article}</td>
                        <td className="p-3 font-bold text-blue-700">Size {s.size}</td>
                        <td className="p-3 text-center font-semibold">{s.quantity}</td>
                        <td className="p-3 text-right font-black text-slate-900">₹{s.quantity * s.price}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditSaleModal(s)}
                              className="rounded-lg border bg-white px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSale(s)}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* MODAL: EDIT SALE POPUP */}
        {editingSale && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
              <h3 className="text-base font-bold text-slate-900">
                Edit Sale: {editingSale.productName}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Article: <span className="font-mono">{editingSale.article}</span> · Size: <strong>{editingSale.size}</strong>
              </p>

              <form onSubmit={handleSaveEditedSale} className="mt-5 space-y-4">
                <div>
                  <label className={labelClass}>Quantity Sold</label>
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    value={editSaleQty}
                    onChange={(e) => setEditSaleQty(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Stock will automatically synchronize if you change the quantity.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Selling Price per Unit (₹)</label>
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={editSalePrice}
                    onChange={(e) => setEditSalePrice(e.target.value)}
                    required
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSale(null)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* WHATSAPP INSTANT REPORTS */}
        {sheet === "Reports" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Instant WhatsApp Sales Reports</h2>
              <p className="text-xs text-slate-500">
                Click any report button below to automatically generate and forward the highest selling footwear report to your WhatsApp.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => sendWhatsAppReport(7)}
                className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center transition hover:bg-emerald-100"
              >
                <span className="text-2xl mb-2">⚡</span>
                <span className="text-base font-bold text-emerald-950">Last 7 Days</span>
                <span className="text-xs text-emerald-700 mt-1">Top Selling Items This Week</span>
              </button>

              <button
                type="button"
                onClick={() => sendWhatsAppReport(30)}
                className="flex flex-col items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center transition hover:bg-blue-100"
              >
                <span className="text-2xl mb-2">📅</span>
                <span className="text-base font-bold text-blue-950">Last 30 Days</span>
                <span className="text-xs text-blue-700 mt-1">Monthly Sales & Collection</span>
              </button>

              <button
                type="button"
                onClick={() => sendWhatsAppReport(365)}
                className="flex flex-col items-center justify-center rounded-2xl border border-purple-200 bg-purple-50 p-6 text-center transition hover:bg-purple-100"
              >
                <span className="text-2xl mb-2">📈</span>
                <span className="text-base font-bold text-purple-950">Last 1 Year</span>
                <span className="text-xs text-purple-700 mt-1">Annual Footwear Sales Ledger</span>
              </button>

              <button
                type="button"
                onClick={() => sendWhatsAppReport("ALL")}
                className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-white transition hover:bg-black"
              >
                <span className="text-2xl mb-2">🚀</span>
                <span className="text-base font-bold text-white">All-Time Report</span>
                <span className="text-xs text-slate-300 mt-1">Full Stock & Sales Summary</span>
              </button>
            </div>
          </section>
        )}

        {message && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs sm:text-sm font-semibold text-white shadow-lg">
            {message}
          </div>
        )}

        <footer className="pt-6 pb-4 text-center text-xs text-slate-400">
          Shoe Mart · Cloud Footwear Inventory Management System
        </footer>
      </div>
    </main>
  );
}