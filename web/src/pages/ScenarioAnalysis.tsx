import { useMemo, useState } from "react";

type Article = {
  id: string;
  sku: string;
  name: string;
  group: string;
  basePrice: number;
  baseVolume: number;
  variableCostPerUnit: number;
  fixedCostShare: number;
};

type AdjustmentField =
  | "pricePct"
  | "priceAbsolute"
  | "volumePct"
  | "volumeAbsolute"
  | "variableCostPct"
  | "variableCostAbsolute"
  | "fixedCostPct"
  | "fixedCostAbsolute";

type Adjustment = Partial<Record<AdjustmentField, number>> & { notes?: string };

type Scenario = {
  id: string;
  name: string;
  description: string;
  adjustments: {
    global: Adjustment;
    groups: Record<string, Adjustment>;
    items: Record<string, Adjustment>;
  };
};

type ScenarioArticleResult = {
  article: Article;
  scenarioId: string;
  price: number;
  volume: number;
  revenue: number;
  variableCostPerUnit: number;
  variableCost: number;
  contribution: number;
  contributionPerUnit: number | null;
  marginPct: number | null;
  fixedCost: number;
  profit: number;
  profitMarginPct: number | null;
};

type Totals = {
  revenue: number;
  variableCost: number;
  contribution: number;
  fixedCost: number;
  profit: number;
  volume: number;
  marginPct: number | null;
  profitMarginPct: number | null;
  contributionPerUnit: number | null;
};

type ScenarioComputation = {
  perScenario: Record<string, ScenarioArticleResult[]>;
  scenarioTotals: Record<string, Totals>;
  groupTotals: Record<string, Record<string, Totals>>;
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
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatPercent = (value: number | null) =>
  value === null || Number.isNaN(value) ? "–" : `${percentFormatter.format(value)} %`;
const formatNumber = (value: number) => numberFormatter.format(value);

const createEmptyTotals = (): Totals => ({
  revenue: 0,
  variableCost: 0,
  contribution: 0,
  fixedCost: 0,
  profit: 0,
  volume: 0,
  marginPct: null,
  profitMarginPct: null,
  contributionPerUnit: null,
});

const defaultArticles: Article[] = [
  {
    id: "cb-033",
    sku: "CRB-033",
    name: "Cold Brew 0,33 l",
    group: "Getränke",
    basePrice: 2.29,
    baseVolume: 12500,
    variableCostPerUnit: 0.89,
    fixedCostShare: 9500,
  },
  {
    id: "cc-bar",
    sku: "CCB-45",
    name: "Coffee Cube Energy Bar",
    group: "Snacks",
    basePrice: 1.49,
    baseVolume: 28000,
    variableCostPerUnit: 0.54,
    fixedCostShare: 8200,
  },
  {
    id: "bn-500",
    sku: "BND-500",
    name: "Bohnen Dark Roast 500 g",
    group: "Bohnen",
    basePrice: 7.9,
    baseVolume: 4600,
    variableCostPerUnit: 3.25,
    fixedCostShare: 6100,
  },
];

const defaultScenarios: Scenario[] = [
  {
    id: "baseline",
    name: "Ist-Planung",
    description: "Aktuelle Absatz-, Preis- und Kostenbasis",
    adjustments: {
      global: {},
      groups: {},
      items: {},
    },
  },
  {
    id: "promo-q1",
    name: "Promotion Q1",
    description: "Preisaktion Getränke + Push der Bars über den Lebensmitteleinzelhandel",
    adjustments: {
      global: {},
      groups: {
        Getränke: { pricePct: -5, volumePct: 18 },
      },
      items: {
        "cc-bar": { pricePct: -8, volumePct: 24 },
      },
    },
  },
  {
    id: "cost-inflation",
    name: "Kosteninflation",
    description: "Rohwareneinkauf +10 %, Mischkalkulation für Bars",
    adjustments: {
      global: { variableCostPct: 10 },
      groups: {},
      items: {
        "cc-bar": { pricePct: 3, volumePct: -6 },
      },
    },
  },
];

const parseNumberInput = (value: string): number | undefined => {
  if (value === "") return undefined;
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
};

const createId = () => `scenario-${Math.random().toString(36).slice(2, 9)}`;

const applyAdjustments = (base: number, adjustments: Adjustment[], pctKey: AdjustmentField, absoluteKey: AdjustmentField) => {
  let value = base;
  let absoluteOverride: number | undefined;

  adjustments.forEach((adjustment) => {
    if (!adjustment) return;
    const pct = adjustment[pctKey];
    if (typeof pct === "number" && Number.isFinite(pct)) {
      value *= 1 + pct / 100;
    }
    const absolute = adjustment[absoluteKey];
    if (typeof absolute === "number" && Number.isFinite(absolute)) {
      absoluteOverride = absolute;
    }
  });

  if (typeof absoluteOverride === "number") {
    value = absoluteOverride;
  }

  return value;
};

const computeScenarios = (articles: Article[], scenarios: Scenario[]): ScenarioComputation => {
  const perScenario: Record<string, ScenarioArticleResult[]> = {};
  const scenarioTotals: Record<string, Totals> = {};
  const groupTotals: Record<string, Record<string, Totals>> = {};

  scenarios.forEach((scenario) => {
    const scenarioRows: ScenarioArticleResult[] = [];
    const groupAccumulator: Record<string, Totals> = {};

    articles.forEach((article) => {
      const groupKey = article.group?.trim() ? article.group : "Ohne Zuordnung";
      const adjustmentChain = [
        scenario.adjustments.global,
        scenario.adjustments.groups[groupKey],
        scenario.adjustments.items[article.id],
      ].filter(Boolean) as Adjustment[];

      const price = applyAdjustments(article.basePrice, adjustmentChain, "pricePct", "priceAbsolute");
      const volume = applyAdjustments(article.baseVolume, adjustmentChain, "volumePct", "volumeAbsolute");
      const variableCostPerUnit = applyAdjustments(
        article.variableCostPerUnit,
        adjustmentChain,
        "variableCostPct",
        "variableCostAbsolute",
      );
      const fixedCost = applyAdjustments(article.fixedCostShare, adjustmentChain, "fixedCostPct", "fixedCostAbsolute");

      const revenue = price * volume;
      const variableCost = variableCostPerUnit * volume;
      const contribution = revenue - variableCost;
      const contributionPerUnit = volume > 0 ? contribution / volume : null;
      const marginPct = revenue > 0 ? (contribution / revenue) * 100 : null;
      const profit = contribution - fixedCost;
      const profitMarginPct = revenue > 0 ? (profit / revenue) * 100 : null;

      scenarioRows.push({
        article,
        scenarioId: scenario.id,
        price,
        volume,
        revenue,
        variableCostPerUnit,
        variableCost,
        contribution,
        contributionPerUnit,
        marginPct,
        fixedCost,
        profit,
        profitMarginPct,
      });

      const totals = scenarioTotals[scenario.id] ?? createEmptyTotals();
      totals.revenue += revenue;
      totals.variableCost += variableCost;
      totals.contribution += contribution;
      totals.fixedCost += fixedCost;
      totals.profit += profit;
      totals.volume += volume;
      scenarioTotals[scenario.id] = totals;

      const groupTotal = groupAccumulator[groupKey] ?? createEmptyTotals();
      groupTotal.revenue += revenue;
      groupTotal.variableCost += variableCost;
      groupTotal.contribution += contribution;
      groupTotal.fixedCost += fixedCost;
      groupTotal.profit += profit;
      groupTotal.volume += volume;
      groupAccumulator[groupKey] = groupTotal;
    });

    const totals = scenarioTotals[scenario.id];
    if (totals) {
      totals.marginPct = totals.revenue > 0 ? (totals.contribution / totals.revenue) * 100 : null;
      totals.profitMarginPct = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : null;
      totals.contributionPerUnit = totals.volume > 0 ? totals.contribution / totals.volume : null;
    }

    Object.values(groupAccumulator).forEach((groupTotal) => {
      groupTotal.marginPct = groupTotal.revenue > 0 ? (groupTotal.contribution / groupTotal.revenue) * 100 : null;
      groupTotal.profitMarginPct = groupTotal.revenue > 0 ? (groupTotal.profit / groupTotal.revenue) * 100 : null;
      groupTotal.contributionPerUnit = groupTotal.volume > 0 ? groupTotal.contribution / groupTotal.volume : null;
    });

    perScenario[scenario.id] = scenarioRows;
    groupTotals[scenario.id] = groupAccumulator;
  });

  return { perScenario, scenarioTotals, groupTotals };
};

const ensureScenarioSelected = (scenarios: Scenario[], selectedId: string | null): string => {
  if (selectedId && scenarios.some((scenario) => scenario.id === selectedId)) {
    return selectedId;
  }
  return scenarios[0]?.id ?? "";
};

const adjustmentFields: { key: AdjustmentField; label: string; suffix: string }[] = [
  { key: "pricePct", label: "Preisänderung", suffix: "%" },
  { key: "priceAbsolute", label: "Preis Override", suffix: "€" },
  { key: "volumePct", label: "Mengenänderung", suffix: "%" },
  { key: "volumeAbsolute", label: "Menge Override", suffix: "Stk." },
  { key: "variableCostPct", label: "Variable Kosten", suffix: "%" },
  { key: "variableCostAbsolute", label: "Variable Kosten Override", suffix: "€" },
  { key: "fixedCostPct", label: "Fixkosten", suffix: "%" },
  { key: "fixedCostAbsolute", label: "Fixkosten Override", suffix: "€" },
];

export default function ScenarioAnalysis() {
  const [articles, setArticles] = useState<Article[]>(() => defaultArticles.map((article) => ({ ...article })));
  const [scenarios, setScenarios] = useState<Scenario[]>(() =>
    defaultScenarios.map((scenario) => ({
      ...scenario,
      adjustments: {
        global: { ...scenario.adjustments.global },
        groups: { ...scenario.adjustments.groups },
        items: { ...scenario.adjustments.items },
      },
    })),
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(() => ensureScenarioSelected(defaultScenarios, "promo-q1"));
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");
  const [articleFeedback, setArticleFeedback] = useState<string | null>(null);
  const [newArticle, setNewArticle] = useState({
    sku: "",
    name: "",
    group: "",
    basePrice: "",
    baseVolume: "",
    variableCostPerUnit: "",
    fixedCostShare: "",
  });

  const computation = useMemo(() => computeScenarios(articles, scenarios), [articles, scenarios]);
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [scenarios, selectedScenarioId],
  );

  const scenarioTotals = computation.scenarioTotals;
  const perScenario = computation.perScenario;
  const groupTotals = computation.groupTotals;
  const uniqueGroups = useMemo(() => {
    const groups = new Set<string>();
    articles.forEach((article) => {
      groups.add(article.group?.trim() ? article.group : "Ohne Zuordnung");
    });
    return Array.from(groups).sort((a, b) => a.localeCompare(b, "de"));
  }, [articles]);

  const selectedScenarioRows = selectedScenario ? perScenario[selectedScenario.id] ?? [] : [];
  const filteredRows =
    selectedGroup === "ALL"
      ? selectedScenarioRows
      : selectedScenarioRows.filter((row) => {
          const groupKey = row.article.group?.trim() ? row.article.group : "Ohne Zuordnung";
          return groupKey === selectedGroup;
        });

  const filteredGroupTotals =
    selectedScenario && groupTotals[selectedScenario.id]
      ? Object.entries(groupTotals[selectedScenario.id]).sort((a, b) => a[0].localeCompare(b[0], "de"))
      : [];

  const profitScale = useMemo(() => {
    const profits = scenarios.map((scenario) => computation.scenarioTotals[scenario.id]?.profit ?? 0);
    const maxAbs = Math.max(...profits.map((value) => Math.abs(value)), 1);
    return { max: maxAbs };
  }, [scenarios, computation.scenarioTotals]);

  const updateScenarioMeta = (scenarioId: string, updates: Partial<Omit<Scenario, "id" | "adjustments">>) => {
    setScenarios((prev) =>
      prev.map((scenario) =>
        scenario.id === scenarioId
          ? {
              ...scenario,
              ...updates,
            }
          : scenario,
      ),
    );
  };

  const updateScenarioAdjustment = (
    scenarioId: string,
    scope: "global" | "group" | "item",
    key: string,
    field: AdjustmentField,
    rawValue: string,
  ) => {
    const parsed = parseNumberInput(rawValue);
    setScenarios((prev) =>
      prev.map((scenario) => {
        if (scenario.id !== scenarioId) return scenario;
        const nextScenario: Scenario = {
          ...scenario,
          adjustments: {
            global: { ...scenario.adjustments.global },
            groups: { ...scenario.adjustments.groups },
            items: { ...scenario.adjustments.items },
          },
        };

        const targetRecord =
          scope === "global"
            ? nextScenario.adjustments.global
            : scope === "group"
            ? nextScenario.adjustments.groups[key] ?? {}
            : nextScenario.adjustments.items[key] ?? {};

        const nextTarget: Adjustment = { ...targetRecord };

        if (parsed === undefined) {
          delete nextTarget[field];
        } else {
          nextTarget[field] = parsed;
        }

        if (scope === "global") {
          nextScenario.adjustments.global = nextTarget;
        } else if (scope === "group") {
          if (Object.keys(nextTarget).length === 0) {
            const groupsCopy = { ...nextScenario.adjustments.groups };
            delete groupsCopy[key];
            nextScenario.adjustments.groups = groupsCopy;
          } else {
            nextScenario.adjustments.groups = {
              ...nextScenario.adjustments.groups,
              [key]: nextTarget,
            };
          }
        } else {
          if (Object.keys(nextTarget).length === 0) {
            const itemsCopy = { ...nextScenario.adjustments.items };
            delete itemsCopy[key];
            nextScenario.adjustments.items = itemsCopy;
          } else {
            nextScenario.adjustments.items = {
              ...nextScenario.adjustments.items,
              [key]: nextTarget,
            };
          }
        }

        return nextScenario;
      }),
    );
  };

  const addScenario = () => {
    const id = createId();
    const scenario: Scenario = {
      id,
      name: `Szenario ${scenarios.length}`,
      description: "",
      adjustments: {
        global: {},
        groups: {},
        items: {},
      },
    };
    setScenarios((prev) => [...prev, scenario]);
    setSelectedScenarioId(id);
  };

  const duplicateScenario = (scenarioId: string) => {
    const source = scenarios.find((scenario) => scenario.id === scenarioId);
    if (!source) return;
    const id = createId();
    const clone: Scenario = {
      id,
      name: `${source.name} Kopie`,
      description: source.description,
      adjustments: {
        global: { ...source.adjustments.global },
        groups: Object.fromEntries(
          Object.entries(source.adjustments.groups).map(([key, value]) => [key, { ...value }]),
        ),
        items: Object.fromEntries(
          Object.entries(source.adjustments.items).map(([key, value]) => [key, { ...value }]),
        ),
      },
    };
    setScenarios((prev) => [...prev, clone]);
    setSelectedScenarioId(id);
  };

  const removeScenario = (scenarioId: string) => {
    setScenarios((prev) => prev.filter((scenario) => scenario.id !== scenarioId));
    setSelectedScenarioId((current) => {
      if (current === scenarioId) {
        const remaining = scenarios.filter((scenario) => scenario.id !== scenarioId);
        return ensureScenarioSelected(remaining, remaining[0]?.id ?? null);
      }
      return current;
    });
  };

  const updateArticle = (articleId: string, field: keyof Article, rawValue: string) => {
    setArticles((prev) =>
      prev.map((article) => {
        if (article.id !== articleId) return article;
        if (field === "basePrice" || field === "baseVolume" || field === "variableCostPerUnit" || field === "fixedCostShare") {
          const parsed = parseNumberInput(rawValue);
          return {
            ...article,
            [field]: typeof parsed === "number" ? parsed : 0,
          };
        }
        return {
          ...article,
          [field]: rawValue,
        };
      }),
    );
  };

  const removeArticle = (articleId: string) => {
    setArticles((prev) => prev.filter((article) => article.id !== articleId));
    setScenarios((prev) =>
      prev.map((scenario) => {
        if (!scenario.adjustments.items[articleId]) return scenario;
        const nextItems = { ...scenario.adjustments.items };
        delete nextItems[articleId];
        return {
          ...scenario,
          adjustments: {
            ...scenario.adjustments,
            items: nextItems,
          },
        };
      }),
    );
  };

  const resetToSampleData = () => {
    setArticles(defaultArticles.map((article) => ({ ...article })));
    setScenarios(
      defaultScenarios.map((scenario) => ({
        ...scenario,
        adjustments: {
          global: { ...scenario.adjustments.global },
          groups: Object.fromEntries(
            Object.entries(scenario.adjustments.groups).map(([key, value]) => [key, { ...value }]),
          ),
          items: Object.fromEntries(
            Object.entries(scenario.adjustments.items).map(([key, value]) => [key, { ...value }]),
          ),
        },
      })),
    );
    setSelectedScenarioId("promo-q1");
    setSelectedGroup("ALL");
    setArticleFeedback(null);
  };

  const clearAllData = () => {
    setArticles([]);
    setScenarios([
      {
        id: "baseline",
        name: "Ist-Planung",
        description: "",
        adjustments: { global: {}, groups: {}, items: {} },
      },
    ]);
    setSelectedScenarioId("baseline");
    setSelectedGroup("ALL");
    setArticleFeedback(null);
  };

  const handleAddArticle = () => {
    const parsedPrice = parseNumberInput(newArticle.basePrice);
    const parsedVolume = parseNumberInput(newArticle.baseVolume);
    const parsedVariable = parseNumberInput(newArticle.variableCostPerUnit);
    const parsedFixed = parseNumberInput(newArticle.fixedCostShare) ?? 0;

    if (!newArticle.sku || !newArticle.name || parsedPrice === undefined || parsedVolume === undefined || parsedVariable === undefined) {
      setArticleFeedback(
        "Bitte mindestens SKU, Name sowie numerische Werte für Preis, Menge und variable Kosten pro Einheit hinterlegen.",
      );
      return;
    }

    const id = createId();
    const article: Article = {
      id,
      sku: newArticle.sku,
      name: newArticle.name,
      group: newArticle.group,
      basePrice: parsedPrice,
      baseVolume: parsedVolume,
      variableCostPerUnit: parsedVariable,
      fixedCostShare: parsedFixed,
    };

    setArticles((prev) => [...prev, article]);
    setNewArticle({
      sku: "",
      name: "",
      group: "",
      basePrice: "",
      baseVolume: "",
      variableCostPerUnit: "",
      fixedCostShare: "",
    });
    setArticleFeedback(null);
  };

  const selectedScenarioTotals = selectedScenario ? scenarioTotals[selectedScenario.id] : null;

  return (
    <div className="page">
      <header className="page__header">
        <h1>Deckungsbeitrags- und Szenarioanalyse</h1>
        <p>
          Vergleichen Sie Deckungsbeiträge, Margen und EBIT-Wirkungen je Artikel oder Artikelgruppe. Konfigurieren Sie Absatz-, Preis- und
          Kostenhebel als Szenarien, um die optimale Steuerung abzuleiten.
        </p>
      </header>

      <section className="card">
        <h2 className="section-title">State-of-the-Art Methodik</h2>
        <div className="scenario-method">
          <div>
            <h3>Best Practices</h3>
            <ul>
              <li>
                Deckungsbeitrag I = Nettoerlös minus variable Einzelkosten (Material, Fracht, transaktionsabhängige Gebühren).
              </li>
              <li>
                Deckungsbeitrag II berücksichtigt zusätzlich direkt zuordenbare Fixkostenanteile (z. B. promo-spezifische POS-Kosten, handling
                fees, provisionsbasierte Fixkostenblöcke).
              </li>
              <li>Gemeinkosten und Overheads werden erst nach Szenariovergleich auf Ebene Profitabilität (EBIT) verteilt.</li>
              <li>Varianten: Break-even-Preis = (variable Kosten je Einheit + Fixkostenanteil) / (1 − Zielmarge).</li>
              <li>
                Analysen nach Artikeln, Warengruppen und Vertriebskanälen sollten identische Kostentreiber verwenden, um Transparenz zu
                sichern.
              </li>
            </ul>
          </div>
          <div>
            <h3>Datenerfassung</h3>
            <ul>
              <li>Importieren Sie Absatzvolumina, Nettoverkaufspreise und variable Kosten je Einheit aus ERP oder BI-System.</li>
              <li>
                Fixkostenanteile können pro Artikel hinterlegt oder über Zuteilungsschlüssel (z. B. Deckungsbeitrag, Umsatz, Logistikaufwand)
                importiert werden.
              </li>
              <li>
                Für zusätzliche Kostenarten (Retouren, Marketingbudget, Mehrwegpfand etc.) legen Sie eigene Felder oder Szenario-Anpassungen
                an.
              </li>
              <li>Nutzen Sie Szenario-Overrides, um geplante Maßnahmen (Preisänderung, Promo-Volumen, Kostensteigerungen) abzubilden.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="scenario-card-header">
          <h2 className="section-title">Artikeldatenbasis</h2>
          <div className="scenario-card-actions">
            <button type="button" className="btn btn--secondary btn--small" onClick={resetToSampleData}>
              Beispieldaten laden
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={clearAllData}>
              Daten zurücksetzen
            </button>
          </div>
        </div>
        <p className="scenario-description">
          Hinterlegen Sie für jeden Artikel Nettoverkaufspreis, erwartete Absatzmenge, variable Kosten und zuordenbare Fixkosten. Die Werte
          bilden die Basis für das Basisszenario.
        </p>
        {articleFeedback ? <div className="callout callout--danger">{articleFeedback}</div> : null}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Artikel</th>
                <th>Gruppe</th>
                <th>Preis (€)</th>
                <th>Menge</th>
                <th>Variable Kosten (€)</th>
                <th>Fixkosten (€)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articles.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    Noch keine Artikeldaten erfasst.
                  </td>
                </tr>
              ) : (
                articles.map((article) => (
                  <tr key={article.id}>
                    <td>
                      <input
                        type="text"
                        value={article.sku}
                        onChange={(event) => updateArticle(article.id, "sku", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={article.name}
                        onChange={(event) => updateArticle(article.id, "name", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={article.group}
                        onChange={(event) => updateArticle(article.id, "group", event.target.value)}
                        placeholder="z. B. Getränke"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={article.basePrice}
                        onChange={(event) => updateArticle(article.id, "basePrice", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="1"
                        value={article.baseVolume}
                        onChange={(event) => updateArticle(article.id, "baseVolume", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={article.variableCostPerUnit}
                        onChange={(event) => updateArticle(article.id, "variableCostPerUnit", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={article.fixedCostShare}
                        onChange={(event) => updateArticle(article.id, "fixedCostShare", event.target.value)}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => removeArticle(article.id)}>
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <input
                    type="text"
                    value={newArticle.sku}
                    onChange={(event) => setNewArticle((prev) => ({ ...prev, sku: event.target.value }))}
                    placeholder="SKU"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newArticle.name}
                    onChange={(event) => setNewArticle((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Artikelname"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newArticle.group}
                    onChange={(event) => setNewArticle((prev) => ({ ...prev, group: event.target.value }))}
                    placeholder="Gruppe"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={newArticle.basePrice}
                    onChange={(event) => setNewArticle((prev) => ({ ...prev, basePrice: event.target.value }))}
                    placeholder="Preis"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="1"
                    value={newArticle.baseVolume}
                    onChange={(event) => setNewArticle((prev) => ({ ...prev, baseVolume: event.target.value }))}
                    placeholder="Menge"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={newArticle.variableCostPerUnit}
                    onChange={(event) =>
                      setNewArticle((prev) => ({ ...prev, variableCostPerUnit: event.target.value }))
                    }
                    placeholder="Var. Kosten"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={newArticle.fixedCostShare}
                    onChange={(event) => setNewArticle((prev) => ({ ...prev, fixedCostShare: event.target.value }))}
                    placeholder="Fixkosten"
                  />
                </td>
                <td>
                  <button type="button" className="btn btn--secondary btn--small" onClick={handleAddArticle}>
                    Artikel hinzufügen
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="scenario-card-header">
          <h2 className="section-title">Szenarien konfigurieren</h2>
          <div className="scenario-card-actions">
            <button type="button" className="btn btn--secondary btn--small" onClick={addScenario}>
              Neues Szenario
            </button>
            {selectedScenario ? (
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => duplicateScenario(selectedScenario.id)}
              >
                Szenario duplizieren
              </button>
            ) : null}
          </div>
        </div>
        <div className="scenario-manager">
          <aside className="scenario-manager__list" aria-label="Szenarien">
            {scenarios.map((scenario) => {
              const totals = scenarioTotals[scenario.id];
              const profitLabel = totals ? formatCurrency(totals.profit) : "–";
              const marginLabel = totals ? formatPercent(totals.profitMarginPct) : "–";
              const isSelected = scenario.id === selectedScenario?.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  className={`scenario-chip${isSelected ? " scenario-chip--active" : ""}`}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                >
                  <div className="scenario-chip__title">{scenario.name}</div>
                  <div className="scenario-chip__meta">
                    <span>{profitLabel} EBIT</span>
                    <span>{marginLabel}</span>
                  </div>
                </button>
              );
            })}
          </aside>

          {selectedScenario ? (
            <div className="scenario-manager__detail">
              <div className="scenario-detail__header">
                <div className="scenario-detail__title">
                  <label>
                    Bezeichnung
                    <input
                      type="text"
                      value={selectedScenario.name}
                      onChange={(event) => updateScenarioMeta(selectedScenario.id, { name: event.target.value })}
                      disabled={selectedScenario.id === "baseline"}
                    />
                  </label>
                  <label>
                    Beschreibung
                    <textarea
                      rows={3}
                      value={selectedScenario.description}
                      onChange={(event) => updateScenarioMeta(selectedScenario.id, { description: event.target.value })}
                      placeholder="Ziel, Annahmen, Ableitungen"
                    />
                  </label>
                </div>
                {selectedScenario.id !== "baseline" ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => removeScenario(selectedScenario.id)}
                  >
                    Szenario löschen
                  </button>
                ) : null}
              </div>

              {selectedScenario.id === "baseline" ? (
                <div className="callout callout--info">
                  Das Basisszenario spiegelt die hinterlegte Datenbasis wider. Passen Sie Preise, Mengen oder Kosten direkt in der Tabelle an
                  oder nutzen Sie zusätzliche Szenarien für Simulationen.
                </div>
              ) : null}

              <section className="scenario-detail__section">
                <h3>Globale Anpassungen</h3>
                <p className="scenario-description">
                  Prozentuale oder absolute Overrides wirken auf alle Artikel des Szenarios. Kombinieren Sie Werte, um z. B. Preise zu erhöhen
                  und gleichzeitig Kostensteigerungen abzubilden.
                </p>
                <div className="scenario-adjustment-grid">
                  {adjustmentFields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <div className="scenario-input-wrapper">
                        <input
                          type="number"
                          step={field.suffix === "%" ? 0.1 : 0.01}
                          value={
                            selectedScenario.adjustments.global[field.key] !== undefined
                              ? selectedScenario.adjustments.global[field.key]
                              : ""
                          }
                          onChange={(event) =>
                            updateScenarioAdjustment(selectedScenario.id, "global", "global", field.key, event.target.value)
                          }
                        />
                        <span className="scenario-input-suffix">{field.suffix}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <section className="scenario-detail__section">
                <h3>Gruppenspezifische Anpassungen</h3>
                <p className="scenario-description">
                  Steuern Sie gezielt Warengruppen oder Vertriebskanäle. Leere Felder bedeuten: Basisszenario übernehmen.
                </p>
                {uniqueGroups.length === 0 ? (
                  <p className="scenario-empty">Keine Gruppen verfügbar.</p>
                ) : (
                  <div className="scenario-groups">
                    {uniqueGroups.map((group) => (
                      <div key={group} className="scenario-group-card">
                        <header>
                          <strong>{group}</strong>
                        </header>
                        <div className="scenario-adjustment-grid">
                          {adjustmentFields.map((field) => (
                            <label key={field.key}>
                              {field.label}
                              <div className="scenario-input-wrapper">
                                <input
                                  type="number"
                                  step={field.suffix === "%" ? 0.1 : 0.01}
                                  value={
                                    selectedScenario.adjustments.groups[group]?.[field.key] !== undefined
                                      ? selectedScenario.adjustments.groups[group]?.[field.key]
                                      : ""
                                  }
                                  onChange={(event) =>
                                    updateScenarioAdjustment(selectedScenario.id, "group", group, field.key, event.target.value)
                                  }
                                />
                                <span className="scenario-input-suffix">{field.suffix}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="scenario-detail__section">
                <h3>Artikel-Overrides</h3>
                <p className="scenario-description">
                  Feintuning auf SKU-Ebene: Übersteuern Sie einzelne Produkte oder ergänzen Sie Maßnahmen (z. B. neue Rezeptur, individueller
                  Aktionsrabatt).
                </p>
                {articles.length === 0 ? (
                  <p className="scenario-empty">Keine Artikel verfügbar.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Artikel</th>
                          <th>Gruppe</th>
                          {adjustmentFields.map((field) => (
                            <th key={field.key}>{field.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {articles.map((article) => {
                          const groupKey = article.group?.trim() ? article.group : "Ohne Zuordnung";
                          return (
                            <tr key={article.id}>
                              <td>{article.name}</td>
                              <td>{groupKey}</td>
                              {adjustmentFields.map((field) => (
                                <td key={field.key}>
                                  <div className="scenario-input-wrapper">
                                    <input
                                      type="number"
                                      step={field.suffix === "%" ? 0.1 : 0.01}
                                      value={
                                        selectedScenario.adjustments.items[article.id]?.[field.key] !== undefined
                                          ? selectedScenario.adjustments.items[article.id]?.[field.key]
                                          : ""
                                      }
                                      onChange={(event) =>
                                        updateScenarioAdjustment(
                                          selectedScenario.id,
                                          "item",
                                          article.id,
                                          field.key,
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <span className="scenario-input-suffix">{field.suffix}</span>
                                  </div>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Szenariovergleich</h2>
        {scenarios.length === 0 || articles.length === 0 ? (
          <p className="scenario-empty">Bitte mindestens ein Szenario und einen Artikel hinterlegen.</p>
        ) : (
          <div className="scenario-summary">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kennzahl</th>
                    {scenarios.map((scenario) => (
                      <th key={scenario.id}>{scenario.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "revenue", label: "Umsatz", formatter: formatCurrency },
                    { key: "variableCost", label: "Variable Kosten", formatter: formatCurrency },
                    { key: "contribution", label: "Deckungsbeitrag I", formatter: formatCurrency },
                    { key: "contributionPerUnit", label: "Deckungsbeitrag je Einheit", formatter: (value: number | null) => (value === null ? "–" : formatCurrency(value)) },
                    { key: "marginPct", label: "Deckungsbeitragsquote", formatter: formatPercent },
                    { key: "fixedCost", label: "Direkte Fixkosten", formatter: formatCurrency },
                    { key: "profit", label: "EBIT (Deckungsbeitrag II)", formatter: formatCurrency },
                    { key: "profitMarginPct", label: "EBIT-Marge", formatter: formatPercent },
                    { key: "volume", label: "Absatzmenge", formatter: formatNumber },
                  ].map((row) => (
                    <tr key={row.key as string}>
                      <th>{row.label}</th>
                      {scenarios.map((scenario) => {
                        const totals = scenarioTotals[scenario.id];
                        const value = totals ? (row.key === "contributionPerUnit" ? totals.contributionPerUnit : (totals as any)[row.key]) : null;
                        return <td key={scenario.id}>{value === null || value === undefined ? "–" : row.formatter(value)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="scenario-bars">
              {scenarios.map((scenario) => {
                const totals = scenarioTotals[scenario.id];
                const profit = totals?.profit ?? 0;
                const percent = (Math.abs(profit) / profitScale.max) * 100;
                const positive = profit >= 0;
                return (
                  <div key={scenario.id} className="scenario-bar">
                    <div className="scenario-bar__label">
                      <strong>{scenario.name}</strong>
                      <span>{totals ? formatCurrency(profit) : "–"}</span>
                    </div>
                    <div className="scenario-bar__track">
                      <div
                        className={`scenario-bar__value${positive ? "" : " scenario-bar__value--negative"}`}
                        style={{ width: `${percent}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="scenario-bar__margin">{totals ? formatPercent(totals.profitMarginPct) : "–"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="scenario-card-header">
          <h2 className="section-title">Detailanalyse</h2>
          <div className="scenario-card-actions">
            <label className="scenario-filter">
              Fokus
              <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>
                <option value="ALL">Alle Gruppen</option>
                {uniqueGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
            <label className="scenario-filter">
              Szenario
              <select value={selectedScenario?.id ?? ""} onChange={(event) => setSelectedScenarioId(event.target.value)}>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!selectedScenario ? (
          <p className="scenario-empty">Bitte ein Szenario auswählen.</p>
        ) : (
          <div className="scenario-detail-view">
            <div className="scenario-detail-summary">
              <div className="scenario-metric">
                <span>Umsatz</span>
                <strong>{selectedScenarioTotals ? formatCurrency(selectedScenarioTotals.revenue) : "–"}</strong>
              </div>
              <div className="scenario-metric">
                <span>Deckungsbeitrag I</span>
                <strong>{selectedScenarioTotals ? formatCurrency(selectedScenarioTotals.contribution) : "–"}</strong>
              </div>
              <div className="scenario-metric">
                <span>EBIT</span>
                <strong>{selectedScenarioTotals ? formatCurrency(selectedScenarioTotals.profit) : "–"}</strong>
              </div>
              <div className="scenario-metric">
                <span>DB-Quote</span>
                <strong>{selectedScenarioTotals ? formatPercent(selectedScenarioTotals.marginPct) : "–"}</strong>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Gruppe</th>
                    <th>Preis (€)</th>
                    <th>Menge</th>
                    <th>Umsatz</th>
                    <th>Variable Kosten</th>
                    <th>DB I</th>
                    <th>DB je Einheit</th>
                    <th>DB-Quote</th>
                    <th>Fixkosten</th>
                    <th>EBIT</th>
                    <th>EBIT-Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                        Keine Artikel in dieser Auswahl.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const groupKey = row.article.group?.trim() ? row.article.group : "Ohne Zuordnung";
                      return (
                        <tr key={row.article.id}>
                          <td>{row.article.name}</td>
                          <td>{groupKey}</td>
                          <td>{formatCurrency(row.price)}</td>
                          <td>{formatNumber(row.volume)}</td>
                          <td>{formatCurrency(row.revenue)}</td>
                          <td>{formatCurrency(row.variableCost)}</td>
                          <td>{formatCurrency(row.contribution)}</td>
                          <td>{row.contributionPerUnit === null ? "–" : formatCurrency(row.contributionPerUnit)}</td>
                          <td>{formatPercent(row.marginPct)}</td>
                          <td>{formatCurrency(row.fixedCost)}</td>
                          <td>{formatCurrency(row.profit)}</td>
                          <td>{formatPercent(row.profitMarginPct)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="scenario-groups-table">
              <h3>Aggregierte Gruppenperspektive</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Gruppe</th>
                      <th>Umsatz</th>
                      <th>Variable Kosten</th>
                      <th>DB I</th>
                      <th>DB-Quote</th>
                      <th>Fixkosten</th>
                      <th>EBIT</th>
                      <th>EBIT-Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroupTotals.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                          Keine Gruppenwerte verfügbar.
                        </td>
                      </tr>
                    ) : (
                      filteredGroupTotals.map(([group, totals]) => (
                        <tr key={group}>
                          <td>{group}</td>
                          <td>{formatCurrency(totals.revenue)}</td>
                          <td>{formatCurrency(totals.variableCost)}</td>
                          <td>{formatCurrency(totals.contribution)}</td>
                          <td>{formatPercent(totals.marginPct)}</td>
                          <td>{formatCurrency(totals.fixedCost)}</td>
                          <td>{formatCurrency(totals.profit)}</td>
                          <td>{formatPercent(totals.profitMarginPct)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

