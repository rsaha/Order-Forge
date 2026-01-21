import type { Product } from "@shared/schema";

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function wordSimilarity(word1: string, word2: string): number {
  if (word1 === word2) return 1;
  if (word2.startsWith(word1) || word1.startsWith(word2)) return 0.9;
  if (word2.includes(word1) || word1.includes(word2)) return 0.8;
  
  const maxLen = Math.max(word1.length, word2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(word1, word2);
  const similarity = 1 - distance / maxLen;
  
  return Math.max(0, similarity);
}

function getMatchScore(query: string, text: string | null | undefined): number {
  if (!text) return 0;
  
  const normalizedText = text.toLowerCase().trim();
  const normalizedQuery = query.toLowerCase().trim();
  
  if (normalizedText === normalizedQuery) return 100;
  if (normalizedText.startsWith(normalizedQuery)) return 90;
  if (normalizedText.includes(normalizedQuery)) return 80;
  
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
  const textWords = normalizedText.split(/[\s\-_()]+/).filter(w => w.length > 0);
  
  if (queryWords.length === 0) return 0;
  
  let totalScore = 0;
  let matchedWords = 0;
  
  for (const qWord of queryWords) {
    let bestWordScore = 0;
    
    for (const tWord of textWords) {
      if (tWord === qWord) {
        bestWordScore = Math.max(bestWordScore, 1);
      } else if (tWord.startsWith(qWord) || qWord.startsWith(tWord)) {
        bestWordScore = Math.max(bestWordScore, 0.85);
      } else if (tWord.includes(qWord) || qWord.includes(tWord)) {
        bestWordScore = Math.max(bestWordScore, 0.7);
      } else if (qWord.length >= 3) {
        const similarity = wordSimilarity(qWord, tWord);
        if (similarity >= 0.6) {
          bestWordScore = Math.max(bestWordScore, similarity * 0.6);
        }
      }
    }
    
    if (bestWordScore > 0) {
      matchedWords++;
      totalScore += bestWordScore;
    }
  }
  
  if (matchedWords === 0) return 0;
  
  const coverage = matchedWords / queryWords.length;
  const avgScore = totalScore / queryWords.length;
  
  return coverage * avgScore * 70;
}

export interface ProductSearchResult {
  product: Product;
  score: number;
  matchField: 'name' | 'sku' | 'alias1' | 'alias2' | 'brand';
}

export function fuzzySearchProducts(
  products: Product[],
  query: string,
  minScore: number = 20
): ProductSearchResult[] {
  if (!query.trim()) return [];
  
  const results: ProductSearchResult[] = [];
  
  for (const product of products) {
    const nameScore = getMatchScore(query, product.name);
    const skuScore = getMatchScore(query, product.sku) * 1.1;
    const alias1Score = getMatchScore(query, product.alias1);
    const alias2Score = getMatchScore(query, product.alias2);
    const brandScore = getMatchScore(query, product.brand) * 0.5;
    
    const scores: { score: number; field: ProductSearchResult['matchField'] }[] = [
      { score: nameScore, field: 'name' },
      { score: skuScore, field: 'sku' },
      { score: alias1Score, field: 'alias1' },
      { score: alias2Score, field: 'alias2' },
      { score: brandScore, field: 'brand' },
    ];
    
    const best = scores.reduce((a, b) => a.score > b.score ? a : b);
    
    if (best.score >= minScore) {
      results.push({
        product,
        score: best.score,
        matchField: best.field,
      });
    }
  }
  
  return results.sort((a, b) => b.score - a.score);
}

export function filterProductsWithFuzzySearch(
  products: Product[],
  query: string,
  selectedBrand: string | null = null
): Product[] {
  let filtered = products;
  
  if (selectedBrand) {
    filtered = filtered.filter(p => p.brand === selectedBrand);
  }
  
  if (!query.trim()) {
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  const results = fuzzySearchProducts(filtered, query, 15);
  return results.map(r => r.product);
}
