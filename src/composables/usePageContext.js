import { ref } from 'vue'

const pageContext = ref({})

export const usePageContext = () => {
  const setPageContext = (payload) => {
    pageContext.value = payload
  }
  const clearPageContext = () => {
    pageContext.value = {}
  }
  return { pageContext, setPageContext, clearPageContext }
}
