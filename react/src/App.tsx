import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { Dashboard } from './features/dashboard/Dashboard'
import { DocumentsGrid } from './features/documents/DocumentsGrid'
import { TemplatesGallery } from './features/templates/TemplatesGallery'
import { CreateFlow } from './features/create/CreateFlow'
import { PrepareDesign } from './features/prepare/PrepareDesign'
import { SignDocument } from './features/sign/SignDocument'
import { CompletedView } from './features/completed/CompletedView'
import { getPublicBasePath } from './basePath';

function App() {
  return (
     <BrowserRouter basename={getPublicBasePath()}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="documents" element={<DocumentsGrid />} />
          <Route path="templates" element={<TemplatesGallery />} />
        </Route>
        <Route path="new" element={<CreateFlow />} />
        <Route path="prepare" element={<PrepareDesign />} />
        <Route path="prepare/:documentId" element={<PrepareDesign />} />
        <Route path="sign" element={<SignDocument />} />
        <Route path="sign/:documentId" element={<SignDocument />} />
        <Route path="completed" element={<CompletedView />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
