import { useState, useEffect, useCallback, useRef } from 'react';
import { productRecipeApi, type ProductRecipe } from '@/lib/productRecipeApi';
import { useOCRDetectionStore } from '@/state/ocrDetectionStore';
import { type StageRecipe, fetchRecipes } from '@/lib/stageRecipeApi';
import toast from 'react-hot-toast';

export function useProductRecipe(applyRecipe: (recipe: StageRecipe) => void) {
  const [products, setProducts] = useState<ProductRecipe[]>([]);
  const [currentProduct, setCurrentProduct] = useState<ProductRecipe | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    currentProductId,
    currentProductStageIndex,
    setCurrentProductId,
    nextProductStage: nextStageAction,
    prevProductStage: prevStageAction,
  } = useOCRDetectionStore();

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productRecipeApi.list();
      setProducts(data);
      if (currentProductId) {
        const found = data.find(p => p.id === currentProductId);
        if (found) setCurrentProduct(found);
      }
    } catch (e) {
      console.error('Failed to load products', e);
    } finally {
      setLoading(false);
    }
  }, [currentProductId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Handle stage application
  const applyStageSequenceRef = useRef(0);
  const applyStage = useCallback(async (index: number, product: ProductRecipe) => {
    const stage = product.stages[index];
    if (!stage) return;

    const requestSequence = ++applyStageSequenceRef.current;
    try {
      // Find the actual StageRecipe object
      const allRecipes = await fetchRecipes();
      if (requestSequence !== applyStageSequenceRef.current) return; // 已被更新的切换请求取代，丢弃过期响应

      const recipe = allRecipes.find(r => r.id === stage.stage_recipe);
      if (recipe) {
        applyRecipe(recipe);
      } else {
        toast.error(`未找到工序配方: ${stage.stage_recipe_name}`);
      }
    } catch (e) {
      if (requestSequence !== applyStageSequenceRef.current) return;
      toast.error('加载工序数据失败');
    }
  }, [applyRecipe]);

  const selectProduct = useCallback((id: string | null) => {
    setCurrentProductId(id);
    if (!id) {
      setCurrentProduct(null);
      return;
    }
    const product = products.find(p => p.id === id);
    if (product) {
      setCurrentProduct(product);
      if (product.stages.length > 0) {
        applyStage(0, product);
      }
    }
  }, [products, setCurrentProductId, applyStage]);

  const goToNextStage = useCallback(() => {
    if (currentProduct && currentProductStageIndex < currentProduct.stages.length - 1) {
      const nextIndex = currentProductStageIndex + 1;
      nextStageAction();
      applyStage(nextIndex, currentProduct);
      toast.success(`进入下一工序: ${currentProduct.stages[nextIndex].stage_recipe_name}`);
    }
  }, [currentProduct, currentProductStageIndex, nextStageAction, applyStage]);

  const goToPrevStage = useCallback(() => {
    if (currentProduct && currentProductStageIndex > 0) {
      const prevIndex = currentProductStageIndex - 1;
      prevStageAction();
      applyStage(prevIndex, currentProduct);
      toast.success(`返回上一工序: ${currentProduct.stages[prevIndex].stage_recipe_name}`);
    }
  }, [currentProduct, currentProductStageIndex, prevStageAction, applyStage]);

  return {
    products,
    currentProduct,
    currentProductStageIndex,
    loading,
    selectProduct,
    goToNextStage,
    goToPrevStage,
  };
}
