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

  // A02：工序切换请求序号 — 所有“加载→校验→应用→提交索引”都是原子操作；
  // 换产品/自由模式/卸载都会使在途请求作废，过期响应不得应用旧配方。
  const applyStageSequenceRef = useRef(0);

  useEffect(() => {
    // 卸载时作废所有在途工序切换请求
    return () => { applyStageSequenceRef.current += 1; };
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productRecipeApi.list();
      setProducts(data);
      if (currentProductId) {
        const found = data.find(p => p.id === currentProductId);
        if (found) {
          setCurrentProduct(found);
          // A02：页面恢复/重启时，重新校验并应用当前工序配方（不能只恢复产品对象）
          void applyStage(currentProductStageIndex, found);
        }
      }
    } catch (e) {
      console.error('Failed to load products', e);
    } finally {
      setLoading(false);
    }
  }, [currentProductId, currentProductStageIndex]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Handle stage application. 返回是否切换成功；失败不推进索引（A02）。
  const applyStage = useCallback(async (index: number, product: ProductRecipe): Promise<boolean> => {
    const stage = product.stages[index];
    if (!stage) return false;

    const requestSequence = ++applyStageSequenceRef.current;
    try {
      // Find the actual StageRecipe object
      const allRecipes = await fetchRecipes();
      if (requestSequence !== applyStageSequenceRef.current) return false; // 已被更新的切换请求取代，丢弃过期响应

      const recipe = allRecipes.find(r => r.id === stage.stage_recipe);
      if (recipe) {
        applyRecipe(recipe);
        return true;
      }
      if (requestSequence === applyStageSequenceRef.current) {
        toast.error(`未找到工序配方: ${stage.stage_recipe_name}，未切换成功，仍为原工序`);
      }
      return false;
    } catch (e) {
      if (requestSequence !== applyStageSequenceRef.current) return false;
      toast.error('加载工序数据失败，未切换成功，仍为原工序');
      return false;
    }
  }, [applyRecipe]);

  const selectProduct = useCallback((id: string | null) => {
    // A02：选择自由模式或切换产品时，作废尚未返回的旧工序请求
    applyStageSequenceRef.current += 1;
    setCurrentProductId(id);
    if (!id) {
      setCurrentProduct(null);
      return;
    }
    const product = products.find(p => p.id === id);
    if (product) {
      setCurrentProduct(product);
      if (product.stages.length > 0) {
        void applyStage(0, product);
      }
    }
  }, [products, setCurrentProductId, applyStage]);

  const goToNextStage = useCallback(async () => {
    if (!currentProduct) return;
    const nextIndex = currentProductStageIndex + 1;
    if (nextIndex > currentProduct.stages.length - 1) return;
    // A02：加载、校验成功后才推进索引与提示；失败保留原工序身份
    const ok = await applyStage(nextIndex, currentProduct);
    if (!ok) return;
    nextStageAction();
    toast.success(`进入下一工序: ${currentProduct.stages[nextIndex].stage_recipe_name}`);
  }, [currentProduct, currentProductStageIndex, nextStageAction, applyStage]);

  const goToPrevStage = useCallback(async () => {
    if (!currentProduct) return;
    const prevIndex = currentProductStageIndex - 1;
    if (prevIndex < 0) return;
    const ok = await applyStage(prevIndex, currentProduct);
    if (!ok) return;
    prevStageAction();
    toast.success(`返回上一工序: ${currentProduct.stages[prevIndex].stage_recipe_name}`);
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
