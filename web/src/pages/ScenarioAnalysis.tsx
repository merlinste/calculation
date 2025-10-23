import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Article = {
  id: string;
  sku: string;
  name: string;
  group: string;
  lastPurchasePrice: number;
  defaultSalesPrice: number;
  defaultVolume: number;
  packagingCost: number;
  dualSystemCost: number;
  paymentCost: number;
  shippingCost: number;
  fixedCostShare: number;
};

type ArticleInput = {
  salesPrice: number;
  discountPerUnit: number;
  purchasePrice: number;
  packagingCost: number;
  dualSystemCost: number;
  paymentCost: number;
  shippingCost: number;
  volume: number;
  fixedCost: number;
};

type ArticleResult = {
  article: Article;
  inputs: ArticleInput;
  netPricePerUnit: number;
  generationCostPerUnit: number;
  contributionPerUnit: number;
  revenue: number;
  generationCost: number;
  absoluteContribution: number;
  profit: number;
  marginPct: number | null;
  profitMarginPct: number | null;
};

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const percentFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatPercent = (value: number | null) =>
  value === null || Number.isNaN(value)
    ? "–"
    : `${percentFormatter.format(value)} %`;
const formatInteger = (value: number) => numberFormatter.format(value);

const withBaseUrl = (path: string) => {
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\//, "")}`;
};

const PRODUCTS_URL = withBaseUrl("data/products.json");
const PRICES_URL = withBaseUrl("data/prices.json");

const fallbackArticles: Article[] = [
  {
    id: "capsules-10",
    sku: "KAP-010",
    name: "Kapseln 10-Pack",
    group: "Kapseln",
    lastPurchasePrice: 1.84,
    defaultSalesPrice: 4.49,
    defaultVolume: 14800,
    packagingCost: 0.18,
    dualSystemCost: 0.22,
    paymentCost: 0.35,
    shippingCost: 0.32,
    fixedCostShare: 4200,
  },
  {
    id: "capsules-30",
    sku: "KAP-030",
    name: "Kapseln 30-Pack",
    group: "Kapseln",
    lastPurchasePrice: 4.9,
    defaultSalesPrice: 11.99,
    defaultVolume: 6200,
    packagingCost: 0.42,
    dualSystemCost: 0.35,
    paymentCost: 0.62,
    shippingCost: 0.54,
    fixedCostShare: 3100,
  },
  {
    id: "beans-250",
    sku: "BN-250",
    name: "Lupine Blends 250 g",
    group: "Bohnen",
    lastPurchasePrice: 3.75,
    defaultSalesPrice: 8.9,
    defaultVolume: 9800,
    packagingCost: 0.27,
    dualSystemCost: 0.31,
    paymentCost: 0.41,
    shippingCost: 0.48,
    fixedCostShare: 3600,
  },
  {
    id: "beans-500",
    sku: "BN-500",
    name: "Lupine Blends 500 g",
    group: "Bohnen",
    lastPurchasePrice: 6.45,
    defaultSalesPrice: 13.9,
    defaultVolume: 5400,
    packagingCost: 0.36,
    dualSystemCost: 0.42,
    paymentCost: 0.55,
    shippingCost: 0.62,
    fixedCostShare: 2950,
  },
  {
    id: "espresso-ground",
    sku: "ESP-250",
    name: "Espresso gemahlen 250 g",
    group: "Mahlen & Filter",
    lastPurchasePrice: 3.1,
    defaultSalesPrice: 7.9,
    defaultVolume: 8700,
    packagingCost: 0.3,
    dualSystemCost: 0.25,
    paymentCost: 0.38,
    shippingCost: 0.44,
    fixedCostShare: 2800,
  },
  {
    id: "filter-ground",
    sku: "FLT-250",
    name: "Filter gemahlen 250 g",
    group: "Mahlen & Filter",
    lastPurchasePrice: 2.9,
    defaultSalesPrice: 6.9,
    defaultVolume: 9100,
    packagingCost: 0.28,
    dualSystemCost: 0.22,
    paymentCost: 0.35,
    shippingCost: 0.39,
    fixedCostShare: 2650,
  },
];

const parseNumber = (value: string) => {
  const normalized = value.replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
};

const flattenRecords = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object"
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return flattenRecords(record.data);
  }

  const values: Record<string, unknown>[] = [];
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      values.push(...flattenRecords(value));
    }
  }

  return values;
};

const pickFirstNumber = (
  record: Record<string, unknown>,
  keys: string[]
): number | undefined => {
  for (const key of keys) {
    if (key in record) {
      const numeric = toNumber(record[key]);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  return undefined;
};

const pickFirstString = (
  record: Record<string, unknown>,
  keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return undefined;
};

const extractTimestamp = (record: Record<string, unknown>): number | null => {
  const candidates = [
    record.date,
    record.date_effective,
    record.valid_from,
    record.validUntil,
    record.valid_until,
    record.timestamp,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" || candidate instanceof Date) {
      const value =
        candidate instanceof Date ? candidate.toISOString() : candidate;
      const parsed = new Date(value);
      const time = parsed.getTime();
      if (Number.isFinite(time)) {
        return time;
      }
    }
  }

  return null;
};

const pickLatestRecord = (
  records: Record<string, unknown>[]
): Record<string, unknown> | undefined => {
  if (records.length === 0) {
    return undefined;
  }

  let latest = records[records.length - 1];
  let latestTimestamp = extractTimestamp(latest);

  for (const record of records) {
    const timestamp = extractTimestamp(record);
    if (timestamp !== null && (latestTimestamp === null || timestamp > latestTimestamp)) {
      latest = record;
      latestTimestamp = timestamp;
    }
  }

  return latest;
};

const createInputsFromArticle = (article: Article): ArticleInput => ({
  salesPrice: article.defaultSalesPrice,
  discountPerUnit: 0,
  purchasePrice: article.lastPurchasePrice,
  packagingCost: article.packagingCost,
  dualSystemCost: article.dualSystemCost,
  paymentCost: article.paymentCost,
  shippingCost: article.shippingCost,
  volume: article.defaultVolume,
  fixedCost: article.fixedCostShare,
});


const ScenarioAnalysis = () => {
  const [articles, setArticles] = useState<Article[]>(fallbackArticles);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedArticles, setSelectedArticles] = useState<string[]>(
    fallbackArticles.slice(0, 3).map((article) => article.id)
  );

  const [articleInputs, setArticleInputs] = useState<Record<string, ArticleInput>>(() =>
    fallbackArticles.reduce<Record<string, ArticleInput>>((acc, article) => {
      acc[article.id] = createInputsFromArticle(article);
      return acc;
    }, {})
  );

  useEffect(() => {
    let isCancelled = false;

    const loadArticles = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const productsResponse = await fetch(PRODUCTS_URL, {
          headers: { Accept: "application/json" },
        });

        if (!productsResponse.ok) {
          throw new Error(`Produkte konnten nicht geladen werden (${productsResponse.status})`);
        }

        const parseResponse = async (response: Response) => {
          try {
            return await response.json();
          } catch {
            throw new Error(`Antwort von ${response.url} konnte nicht gelesen werden`);
          }
        };

        const productsPayload = await parseResponse(productsResponse);

        let pricesPayload: unknown = [];
        let priceWarning: string | null = null;

        try {
          const pricesResponse = await fetch(PRICES_URL, {
            headers: { Accept: "application/json" },
          });

          if (!pricesResponse.ok) {
            throw new Error(`Preise konnten nicht geladen werden (${pricesResponse.status})`);
          }

          pricesPayload = await parseResponse(pricesResponse);
        } catch (error) {
          priceWarning = error instanceof Error ? error.message : String(error ?? "");
        }

        const productRecords = flattenRecords(productsPayload);
        const priceRecords = flattenRecords(pricesPayload);

        if (productRecords.length === 0) {
          throw new Error("Es wurden keine Produkte gefunden");
        }

        const priceById = new Map<string, Record<string, unknown>[]>();
        const priceBySku = new Map<string, Record<string, unknown>[]>();

        const registerRecord = (
          map: Map<string, Record<string, unknown>[]>,
          key: unknown,
          record: Record<string, unknown>
        ) => {
          if (typeof key === "string" || typeof key === "number") {
            const normalized = String(key).trim();
            if (!normalized) {
              return;
            }
            const list = map.get(normalized) ?? [];
            list.push(record);
            map.set(normalized, list);
          }
        };

        for (const record of priceRecords) {
          registerRecord(priceById, record["id"], record);
          registerRecord(priceById, record["product_id"], record);
          registerRecord(priceById, record["productId"], record);

          const nestedProduct = record["product"];
          if (nestedProduct && typeof nestedProduct === "object") {
            const nestedRecord = nestedProduct as Record<string, unknown>;
            registerRecord(priceById, nestedRecord["id"], record);
            registerRecord(priceBySku, nestedRecord["sku"], record);
          }

          registerRecord(priceBySku, record["sku"], record);
          registerRecord(priceBySku, record["product_sku"], record);
        }

        const fallbackBySku = new Map(
          fallbackArticles.map((article) => [article.sku.toLowerCase(), article] as const)
        );
        const fallbackById = new Map(
          fallbackArticles.map((article) => [article.id, article] as const)
        );

        const normalizedArticles: Article[] = productRecords.map((record, index) => {
          const candidates: string[] = [];
          const addCandidate = (value: unknown) => {
            if (typeof value === "string" || typeof value === "number") {
              const normalized = String(value).trim();
              if (normalized) {
                candidates.push(normalized);
              }
            }
          };

          addCandidate(record["id"]);
          addCandidate(record["product_id"]);
          addCandidate(record["productId"]);
          addCandidate(record["sku"]);
          addCandidate(record["article_number"]);

          const id = candidates[0] ?? `product-${index}`;
          const sku =
            pickFirstString(record, ["sku", "article_number", "articleNo", "ean"]) ?? id;
          const group =
            pickFirstString(record, ["group", "product_group", "category", "collection"]) ??
            "Weitere";
          const name =
            pickFirstString(record, ["name", "title", "product_name"]) ?? sku;

          const volume =
            pickFirstNumber(record, [
              "default_volume",
              "defaultVolume",
              "volume",
              "forecast_volume",
              "sales_volume",
            ]) ?? 0;

          const priceCandidates: Record<string, unknown>[] = [];
          for (const candidate of candidates) {
            const matches = priceById.get(candidate);
            if (matches) {
              priceCandidates.push(...matches);
            }
          }

          const skuMatches = priceBySku.get(sku);
          if (skuMatches) {
            priceCandidates.push(...skuMatches);
          }

          const priceRecord = pickLatestRecord(priceCandidates);

          const purchasePriceFromPriceRecord =
            priceRecord &&
            pickFirstNumber(priceRecord, [
              "purchase_price_net",
              "purchase_price",
              "last_purchase_price",
              "latest_purchase_price",
              "purchasePriceNet",
              "purchasePrice",
              "purchase",
              "net_cost",
            ]);

          const salesPriceFromPriceRecord =
            priceRecord &&
            pickFirstNumber(priceRecord, [
              "sales_price_net",
              "sales_price",
              "price_net",
              "price",
              "net_price",
            ]);

          const packagingCost =
            (priceRecord &&
              pickFirstNumber(priceRecord, ["packaging_cost", "packing_cost"])) ?? 0;

          const dualSystemCost =
            (priceRecord &&
              pickFirstNumber(priceRecord, [
                "dual_system_cost",
                "dual_system",
                "epr_cost",
                "epr_fee",
                "packaging_license_cost",
                "packaging_licence_cost",
                "licence_cost",
                "license_cost",
                "marketing_cost",
                "marketing",
              ])) ?? 0;

          const paymentCost =
            (priceRecord &&
              pickFirstNumber(priceRecord, [
                "payment_cost",
                "payment_fee",
                "payment_fees",
                "payment",
                "transaction_fee",
                "transaction_fees",
                "other_variable_cost",
                "other_variable_costs",
                "other_cost",
                "other_costs",
              ])) ?? 0;

          const shippingCost =
            (priceRecord &&
              pickFirstNumber(priceRecord, [
                "shipping_cost",
                "shipping",
                "logistics_cost",
                "logistic_cost",
                "freight_cost",
                "freight",
                "delivery_cost",
              ])) ?? 0;

          const fixedCostShare =
            (priceRecord &&
              pickFirstNumber(priceRecord, [
                "fixed_cost",
                "fixed_cost_share",
                "fixed_costs",
              ])) ?? 0;

          const purchasePrice =
            purchasePriceFromPriceRecord ??
            pickFirstNumber(record, [
              "purchase_price",
              "purchase_price_net",
              "last_purchase_price",
              "purchase",
            ]) ??
            0;

          const salesPrice =
            salesPriceFromPriceRecord ??
            pickFirstNumber(record, [
              "sales_price",
              "sales_price_net",
              "price",
              "price_net",
            ]) ??
            (Number.isFinite(purchasePrice) && purchasePrice > 0
              ? purchasePrice * 1.3
              : Number.NaN);

          const fallbackArticle =
            fallbackById.get(id) ?? fallbackBySku.get(sku.toLowerCase());

          return {
            id,
            sku,
            name,
            group,
            lastPurchasePrice:
              Number.isFinite(purchasePrice) && purchasePrice > 0
                ? purchasePrice
                : fallbackArticle?.lastPurchasePrice ?? 0,
            defaultSalesPrice:
              Number.isFinite(salesPrice) && salesPrice > 0
                ? salesPrice
                : fallbackArticle?.defaultSalesPrice ?? 0,
            defaultVolume:
              Number.isFinite(volume) && volume > 0
                ? volume
                : fallbackArticle?.defaultVolume ?? 0,
            packagingCost:
              packagingCost || fallbackArticle?.packagingCost || 0,
            dualSystemCost:
              dualSystemCost || fallbackArticle?.dualSystemCost || 0,
            paymentCost:
              paymentCost || fallbackArticle?.paymentCost || 0,
            shippingCost:
              shippingCost || fallbackArticle?.shippingCost || 0,
            fixedCostShare:
              fixedCostShare || fallbackArticle?.fixedCostShare || 0,
          } satisfies Article;
        });

        if (!isCancelled && normalizedArticles.length > 0) {
          setArticles(normalizedArticles);
          setLoadError(priceWarning);
        }
      } catch (error) {
        if (!isCancelled) {
          const message =
            error instanceof Error ? error.message : String(error ?? "");
          setLoadError(message || "Unbekannter Fehler beim Laden der Artikeldaten");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadArticles();

    return () => {
      isCancelled = true;
    };
  }, []);

  const articleMap = useMemo(
    () =>
      articles.reduce<Record<string, Article>>((acc, article) => {
        acc[article.id] = article;
        return acc;
      }, {}),
    [articles]
  );

  useEffect(() => {
    const availableIds = new Set(articles.map((article) => article.id));

    setArticleInputs((prev) => {
      const next: Record<string, ArticleInput> = {};
      for (const article of articles) {
        next[article.id] = prev[article.id] ?? createInputsFromArticle(article);
      }
      return next;
    });

    setSelectedArticles((prev) => {
      const stillValid = prev.filter((id) => availableIds.has(id));
      if (stillValid.length > 0) {
        return stillValid;
      }
      return articles
        .slice(0, Math.min(3, articles.length))
        .map((article) => article.id);
    });
  }, [articles]);

  const activeArticleIds = useMemo(
    () => selectedArticles.filter((id) => Boolean(articleMap[id])),
    [articleMap, selectedArticles]
  );

  const toggleArticle = (articleId: string) => {
    setSelectedArticles((prev) => {
      if (prev.includes(articleId)) {
        return prev.filter((id) => id !== articleId);
      }

      return [...prev, articleId];
    });

    setArticleInputs((prev) => {
      if (prev[articleId]) {
        return prev;
      }

      const article = articleMap[articleId];
      if (!article) {
        return prev;
      }

      return {
        ...prev,
        [articleId]: createInputsFromArticle(article),
      };
    });
  };

  const handleInputChange = (
    articleId: string,
    field: keyof ArticleInput,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const value = parseNumber(event.target.value);
    setArticleInputs((prev) => ({
      ...prev,
      [articleId]: {
        ...prev[articleId],
        [field]: field === "volume" ? Math.max(0, Math.round(value)) : value,
      },
    }));
  };

  const articleResults = useMemo<ArticleResult[]>(() => {
    return activeArticleIds
      .map((articleId) => {
        const article = articleMap[articleId];
        if (!article) {
          return null;
        }

        const inputs = articleInputs[articleId] ?? createInputsFromArticle(article);
        const netPricePerUnit = inputs.salesPrice - inputs.discountPerUnit;
        const generationCostPerUnit =
          inputs.purchasePrice +
          inputs.packagingCost +
          inputs.dualSystemCost +
          inputs.paymentCost +
          inputs.shippingCost;
        const contributionPerUnit = netPricePerUnit - generationCostPerUnit;
        const revenue = netPricePerUnit * inputs.volume;
        const generationCost = generationCostPerUnit * inputs.volume;
        const absoluteContribution = contributionPerUnit * inputs.volume;
        const profit = absoluteContribution - inputs.fixedCost;
        const marginPct = netPricePerUnit > 0 ? (contributionPerUnit / netPricePerUnit) * 100 : null;
        const profitMarginPct = revenue > 0 ? (profit / revenue) * 100 : null;

        return {
          article,
          inputs,
          netPricePerUnit,
          generationCostPerUnit,
          contributionPerUnit,
          revenue,
          generationCost,
          absoluteContribution,
          profit,
          marginPct,
          profitMarginPct,
        } satisfies ArticleResult;
      })
      .filter((result): result is ArticleResult => result !== null);
  }, [activeArticleIds, articleInputs, articleMap]);

  const resultByArticleId = useMemo(
    () =>
      articleResults.reduce<Record<string, ArticleResult>>((acc, result) => {
        acc[result.article.id] = result;
        return acc;
      }, {}),
    [articleResults]
  );

  const overallTotals = useMemo(() => {
    return articleResults.reduce(
      (acc, result) => {
        acc.revenue += result.revenue;
        acc.generationCost += result.generationCost;
        acc.absoluteContribution += result.absoluteContribution;
        acc.profit += result.profit;
        acc.volume += result.inputs.volume;
        acc.fixedCost += result.inputs.fixedCost;
        return acc;
      },
      {
        revenue: 0,
        generationCost: 0,
        absoluteContribution: 0,
        profit: 0,
        volume: 0,
        fixedCost: 0,
      }
    );
  }, [articleResults]);

  const groupTotals = useMemo(() => {
    return articleResults.reduce<Record<string, typeof overallTotals>>((acc, result) => {
      if (!acc[result.article.group]) {
        acc[result.article.group] = {
          revenue: 0,
          generationCost: 0,
          absoluteContribution: 0,
          profit: 0,
          volume: 0,
          fixedCost: 0,
        };
      }

      const group = acc[result.article.group];
      group.revenue += result.revenue;
      group.generationCost += result.generationCost;
      group.absoluteContribution += result.absoluteContribution;
      group.profit += result.profit;
      group.volume += result.inputs.volume;
      group.fixedCost += result.inputs.fixedCost;
      return acc;
    }, {});
  }, [articleResults]);

  const articlesByGroup = useMemo(() => {
    return articles.reduce<Record<string, Article[]>>((acc, article) => {
      if (!acc[article.group]) {
        acc[article.group] = [];
      }

      acc[article.group].push(article);
      return acc;
    }, {});
  }, [articles]);

  const renderInput = (
    articleId: string,
    field: keyof ArticleInput,
    step = 0.01,
    min?: number
  ) => (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={articleInputs[articleId]?.[field] ?? 0}
      onChange={(event) => handleInputChange(articleId, field, event)}
      className="matrix-input"
    />
  );

  const loadErrorSuffix = loadError
    ? loadError.trim().endsWith('.')
      ? ' '
      : '. '
    : '';

  return (
    <div className="scenario-page">
      <header className="page-header">
        <h1>Deckungsbeitragsanalyse</h1>
        <p>
          Wähle einzelne Artikel oder Artikelgruppen aus, prüfe die zuletzt
          hinterlegten Einkaufspreise und passe sie bei Bedarf manuell an, um
          Deckungsbeiträge und Profitabilität in Echtzeit zu sehen.
        </p>
      </header>

      <section className="section">
        <div className="section-header">
          <h2>Artikel auswählen</h2>
          <p>
            Die Werte für den letzten Einkaufspreis stammen aus der
            Warenwirtschaft und können pro Artikel überschrieben werden.
          </p>
        </div>
        {(isLoading || loadError) && (
          <div className="status-hints" role="status">
            {isLoading && <p className="status-hint">Aktualisiere Artikeldaten …</p>}
            {loadError && (
              <p className="status-hint status-hint--error">
                {loadError}
                {loadErrorSuffix}
                Es werden lokale Referenzdaten angezeigt.
              </p>
            )}
          </div>
        )}
        <div className="article-selector">
          {Object.entries(articlesByGroup).map(([groupName, groupArticles]) => (
            <fieldset key={groupName} className="article-group">
              <legend>{groupName}</legend>
              {groupArticles.map((article) => {
                const isSelected = selectedArticles.includes(article.id);
                const purchasePrice =
                  articleInputs[article.id]?.purchasePrice ?? article.lastPurchasePrice;
                return (
                  <label key={article.id} className={isSelected ? "selected" : undefined}>
                    <span className="article-name">{article.name}</span>
                    <span className="article-meta">
                      <span className="sku">{article.sku}</span>
                      <span className="purchase-price">
                        Letzter EK: {formatCurrency(purchasePrice)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleArticle(article.id)}
                    />
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      </section>

      {activeArticleIds.length === 0 ? (
        <div className="empty-state">
          <p>
            Bitte wähle mindestens einen Artikel aus, um die Kalkulation zu
            starten.
          </p>
        </div>
      ) : (
        <>
          <section className="section">
            <div className="section-header">
              <h2>Kalkulation pro Artikel</h2>
              <p>
                Passe Einkaufspreise, Kostenbestandteile und Absatzannahmen direkt
                in der Matrix an. Berechnungen aktualisieren sich sofort.
              </p>
            </div>
            <div className="matrix-wrapper">
              <table className="article-matrix">
                <thead>
                  <tr>
                    <th>Position</th>
                    {activeArticleIds.map((articleId) => (
                      <th key={articleId}>
                        <div className="matrix-header">
                          <span className="title">{articleMap[articleId].name}</span>
                          <span className="subtitle">{articleMap[articleId].sku}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Verkaufspreis (netto)</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "salesPrice")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Nachlass je Einheit</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "discountPerUnit")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Netto Verkaufspreis</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.netPricePerUnit ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Einkaufspreis (netto)</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "purchasePrice")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Verpackung</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "packagingCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Duales System</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "dualSystemCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Payment</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "paymentCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Shipping</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "shippingCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Erzeugungskosten</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(
                            resultByArticleId[articleId]?.generationCostPerUnit ?? 0
                          )}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Deckungsbeitrag je Einheit</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(
                            resultByArticleId[articleId]?.contributionPerUnit ?? 0
                          )}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>% Deckungsbeitrag</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatPercent(resultByArticleId[articleId]?.marginPct ?? null)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Absatz / Monat</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "volume", 1, 0)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Netto-Umsatz / Monat</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.revenue ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Erzeugungskosten / Monat</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.generationCost ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Deckungsbeitrag / Monat</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(
                            resultByArticleId[articleId]?.absoluteContribution ?? 0
                          )}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Fixkostenanteil / Monat</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "fixedCost", 10)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Ergebnis / Monat</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.profit ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Profitabilität %</th>
                    {activeArticleIds.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatPercent(
                            resultByArticleId[articleId]?.profitMarginPct ?? null
                          )}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h2>Ergebnisse nach Artikel</h2>
              <p>
                Kompakte Übersicht über Umsätze, Deckungsbeiträge und Ergebnis pro
                Artikel.
              </p>
            </div>
            <div className="results-grid">
              {articleResults.map((result) => (
                <article key={result.article.id} className="result-card">
                  <header>
                    <div>
                      <h3>{result.article.name}</h3>
                      <span className="sku">{result.article.sku}</span>
                    </div>
                    <span className="group">{result.article.group}</span>
                  </header>
                  <dl className="result-metrics">
                    <div>
                      <dt>Netto-Umsatz</dt>
                      <dd>{formatCurrency(result.revenue)}</dd>
                    </div>
                    <div>
                      <dt>Erzeugungskosten</dt>
                      <dd>{formatCurrency(result.generationCost)}</dd>
                    </div>
                    <div>
                      <dt>Deckungsbeitrag</dt>
                      <dd>{formatCurrency(result.absoluteContribution)}</dd>
                    </div>
                    <div>
                      <dt>Ergebnis</dt>
                      <dd>{formatCurrency(result.profit)}</dd>
                    </div>
                    <div>
                      <dt>% Deckungsbeitrag</dt>
                      <dd>{formatPercent(result.marginPct)}</dd>
                    </div>
                    <div>
                      <dt>Profitabilität</dt>
                      <dd>{formatPercent(result.profitMarginPct)}</dd>
                    </div>
                    <div>
                      <dt>Absatz / Monat</dt>
                      <dd>{formatInteger(result.inputs.volume)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h2>Aggregierte Ergebnisse</h2>
              <p>
                Summen über alle ausgewählten Artikel sowie Aufschlüsselung nach
                Artikelgruppen.
              </p>
            </div>
            <div className="aggregate-grid">
              <article className="total-card">
                <h3>Gesamt</h3>
                <dl>
                  <div>
                    <dt>Netto-Umsatz</dt>
                    <dd>{formatCurrency(overallTotals.revenue)}</dd>
                  </div>
                  <div>
                    <dt>Erzeugungskosten</dt>
                    <dd>{formatCurrency(overallTotals.generationCost)}</dd>
                  </div>
                  <div>
                    <dt>Deckungsbeitrag</dt>
                    <dd>{formatCurrency(overallTotals.absoluteContribution)}</dd>
                  </div>
                  <div>
                    <dt>Fixkosten</dt>
                    <dd>{formatCurrency(overallTotals.fixedCost)}</dd>
                  </div>
                  <div>
                    <dt>Ergebnis</dt>
                    <dd>{formatCurrency(overallTotals.profit)}</dd>
                  </div>
                  <div>
                    <dt>Absatz / Monat</dt>
                    <dd>{formatInteger(overallTotals.volume)}</dd>
                  </div>
                </dl>
              </article>
              <div className="group-table-wrapper">
                <table className="group-table">
                  <thead>
                    <tr>
                      <th>Artikelgruppe</th>
                      <th>Netto-Umsatz</th>
                      <th>Deckungsbeitrag</th>
                      <th>Ergebnis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupTotals).map(([groupName, totals]) => (
                      <tr key={groupName}>
                        <th>{groupName}</th>
                        <td>{formatCurrency(totals.revenue)}</td>
                        <td>{formatCurrency(totals.absoluteContribution)}</td>
                        <td>{formatCurrency(totals.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ScenarioAnalysis;

