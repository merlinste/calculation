import { ChangeEvent, useMemo, useState } from "react";

type Article = {
  id: string;
  sku: string;
  name: string;
  group: string;
  lastPurchasePrice: number;
  defaultSalesPrice: number;
  defaultVolume: number;
  logisticsCost: number;
  packagingCost: number;
  marketingCost: number;
  otherVariableCost: number;
  fixedCostShare: number;
};

type ArticleInput = {
  salesPrice: number;
  discountPerUnit: number;
  purchasePrice: number;
  logisticsCost: number;
  packagingCost: number;
  marketingCost: number;
  otherVariableCost: number;
  volume: number;
  fixedCost: number;
};

type ArticleResult = {
  article: Article;
  inputs: ArticleInput;
  netPricePerUnit: number;
  variableCostPerUnit: number;
  contributionPerUnit: number;
  revenue: number;
  variableCost: number;
  contribution: number;
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

const defaultArticles: Article[] = [
  {
    id: "capsules-10",
    sku: "KAP-010",
    name: "Kapseln 10-Pack",
    group: "Kapseln",
    lastPurchasePrice: 1.84,
    defaultSalesPrice: 4.49,
    defaultVolume: 14800,
    logisticsCost: 0.32,
    packagingCost: 0.18,
    marketingCost: 0.22,
    otherVariableCost: 0.35,
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
    logisticsCost: 0.54,
    packagingCost: 0.42,
    marketingCost: 0.35,
    otherVariableCost: 0.62,
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
    logisticsCost: 0.48,
    packagingCost: 0.27,
    marketingCost: 0.31,
    otherVariableCost: 0.41,
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
    logisticsCost: 0.62,
    packagingCost: 0.36,
    marketingCost: 0.42,
    otherVariableCost: 0.55,
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
    logisticsCost: 0.44,
    packagingCost: 0.3,
    marketingCost: 0.25,
    otherVariableCost: 0.38,
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
    logisticsCost: 0.39,
    packagingCost: 0.28,
    marketingCost: 0.22,
    otherVariableCost: 0.35,
    fixedCostShare: 2650,
  },
];

const parseNumber = (value: string) => {
  const normalized = value.replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createInputsFromArticle = (article: Article): ArticleInput => ({
  salesPrice: article.defaultSalesPrice,
  discountPerUnit: 0,
  purchasePrice: article.lastPurchasePrice,
  logisticsCost: article.logisticsCost,
  packagingCost: article.packagingCost,
  marketingCost: article.marketingCost,
  otherVariableCost: article.otherVariableCost,
  volume: article.defaultVolume,
  fixedCost: article.fixedCostShare,
});

const ScenarioAnalysis = () => {
  const articleMap = useMemo(
    () =>
      defaultArticles.reduce<Record<string, Article>>((acc, article) => {
        acc[article.id] = article;
        return acc;
      }, {}),
    []
  );

  const [selectedArticles, setSelectedArticles] = useState<string[]>([
    "capsules-10",
    "beans-250",
    "espresso-ground",
  ]);

  const [articleInputs, setArticleInputs] = useState<Record<string, ArticleInput>>(
    () =>
      defaultArticles.reduce<Record<string, ArticleInput>>((acc, article) => {
        acc[article.id] = createInputsFromArticle(article);
        return acc;
      }, {})
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

      return {
        ...prev,
        [articleId]: createInputsFromArticle(articleMap[articleId]),
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
    return selectedArticles
      .map((articleId) => {
        const article = articleMap[articleId];
        if (!article) {
          return null;
        }

        const inputs = articleInputs[articleId] ?? createInputsFromArticle(article);
        const netPricePerUnit = inputs.salesPrice - inputs.discountPerUnit;
        const variableCostPerUnit =
          inputs.purchasePrice +
          inputs.logisticsCost +
          inputs.packagingCost +
          inputs.marketingCost +
          inputs.otherVariableCost;
        const contributionPerUnit = netPricePerUnit - variableCostPerUnit;
        const revenue = netPricePerUnit * inputs.volume;
        const variableCost = variableCostPerUnit * inputs.volume;
        const contribution = contributionPerUnit * inputs.volume;
        const profit = contribution - inputs.fixedCost;
        const marginPct = netPricePerUnit > 0 ? (contributionPerUnit / netPricePerUnit) * 100 : null;
        const profitMarginPct = revenue > 0 ? (profit / revenue) * 100 : null;

        return {
          article,
          inputs,
          netPricePerUnit,
          variableCostPerUnit,
          contributionPerUnit,
          revenue,
          variableCost,
          contribution,
          profit,
          marginPct,
          profitMarginPct,
        } satisfies ArticleResult;
      })
      .filter((result): result is ArticleResult => result !== null);
  }, [articleInputs, articleMap, selectedArticles]);

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
        acc.variableCost += result.variableCost;
        acc.contribution += result.contribution;
        acc.profit += result.profit;
        acc.volume += result.inputs.volume;
        acc.fixedCost += result.inputs.fixedCost;
        return acc;
      },
      {
        revenue: 0,
        variableCost: 0,
        contribution: 0,
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
          variableCost: 0,
          contribution: 0,
          profit: 0,
          volume: 0,
          fixedCost: 0,
        };
      }

      const group = acc[result.article.group];
      group.revenue += result.revenue;
      group.variableCost += result.variableCost;
      group.contribution += result.contribution;
      group.profit += result.profit;
      group.volume += result.inputs.volume;
      group.fixedCost += result.inputs.fixedCost;
      return acc;
    }, {});
  }, [articleResults]);

  const articlesByGroup = useMemo(() => {
    return defaultArticles.reduce<Record<string, Article[]>>((acc, article) => {
      if (!acc[article.group]) {
        acc[article.group] = [];
      }

      acc[article.group].push(article);
      return acc;
    }, {});
  }, []);

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
        <div className="article-selector">
          {Object.entries(articlesByGroup).map(([groupName, articles]) => (
            <fieldset key={groupName} className="article-group">
              <legend>{groupName}</legend>
              {articles.map((article) => {
                const isSelected = selectedArticles.includes(article.id);
                const purchasePrice = articleInputs[article.id]?.purchasePrice ?? article.lastPurchasePrice;
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

      {selectedArticles.length === 0 ? (
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
                Passe Einkaufspreise, variable Kosten und Absatzannahmen direkt in
                der Matrix an. Berechnungen aktualisieren sich sofort.
              </p>
            </div>
            <div className="matrix-wrapper">
              <table className="article-matrix">
                <thead>
                  <tr>
                    <th>Position</th>
                    {selectedArticles.map((articleId) => (
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
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "salesPrice")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Rabatte / Abschläge</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "discountPerUnit")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Netto-Verkaufspreis</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.netPricePerUnit ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Letzter EK-Preis</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "purchasePrice")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Logistik &amp; Handling</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "logisticsCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Verpackung &amp; Gebühren</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "packagingCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Marketingkosten</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "marketingCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Weitere variable Kosten</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "otherVariableCost")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Variable Kosten gesamt</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(
                            resultByArticleId[articleId]?.variableCostPerUnit ?? 0
                          )}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Deckungsbeitrag / Stück</th>
                    {selectedArticles.map((articleId) => (
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
                    <th>Absatz / Monat (Stück)</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "volume", 1, 0)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Netto-Umsatz / Monat</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.revenue ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Variable Kosten / Monat</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.variableCost ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Deckungsbeitrag / Monat</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.contribution ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Fixkostenanteil / Monat</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>{renderInput(articleId, "fixedCost", 10)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Ergebnis / Monat</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatCurrency(resultByArticleId[articleId]?.profit ?? 0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>DB-Marge %</th>
                    {selectedArticles.map((articleId) => (
                      <td key={articleId}>
                        <span className="matrix-value">
                          {formatPercent(resultByArticleId[articleId]?.marginPct ?? null)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Profitabilität %</th>
                    {selectedArticles.map((articleId) => (
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
                      <dt>Variable Kosten</dt>
                      <dd>{formatCurrency(result.variableCost)}</dd>
                    </div>
                    <div>
                      <dt>Deckungsbeitrag</dt>
                      <dd>{formatCurrency(result.contribution)}</dd>
                    </div>
                    <div>
                      <dt>Ergebnis</dt>
                      <dd>{formatCurrency(result.profit)}</dd>
                    </div>
                    <div>
                      <dt>DB-Marge</dt>
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
                    <dt>Variable Kosten</dt>
                    <dd>{formatCurrency(overallTotals.variableCost)}</dd>
                  </div>
                  <div>
                    <dt>Deckungsbeitrag</dt>
                    <dd>{formatCurrency(overallTotals.contribution)}</dd>
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
                        <td>{formatCurrency(totals.contribution)}</td>
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
