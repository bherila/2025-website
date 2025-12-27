<?php

namespace App\Http\Controllers;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\Files\FileForAgreement;
use App\Models\Files\FileForClientCompany;
use App\Models\Files\FileForFinAccount;
use App\Models\Files\FileForProject;
use App\Models\Files\FileForTask;
use App\Models\FinAccounts;
use App\Services\FileStorageService;
use App\Traits\HasFileStorage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

class FileController extends Controller
{
    protected FileStorageService $fileService;

    public function __construct(FileStorageService $fileService)
    {
        $this->fileService = $fileService;
    }

    /**
     * List files for a project.
     */
    public function listProjectFiles(string $companySlug, string $projectSlug): JsonResponse
    {
        $project = $this->getProjectBySlug($companySlug, $projectSlug);

        $files = FileForProject::where('project_id', $project->id)
            ->with('uploader:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($files);
    }

    /**
     * Upload a file to a project.
     */
    public function uploadProjectFile(Request $request, string $companySlug, string $projectSlug): JsonResponse
    {
        Gate::authorize('admin');

        $project = $this->getProjectBySlug($companySlug, $projectSlug);

        $request->validate([
            'file' => 'required|file|max:102400', // 100MB max
        ]);

        $file = $request->file('file');
        $originalFilename = $file->getClientOriginalName();
        $storedFilename = FileForProject::generateStoredFilename($originalFilename);
        $s3Path = FileForProject::generateS3Path($companySlug, $projectSlug, $storedFilename);

        $fileModel = new FileForProject([
            'project_id' => $project->id,
            'original_filename' => $originalFilename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $file->getMimeType(),
            'file_size_bytes' => $file->getSize(),
            'uploaded_by_user_id' => Auth::id(),
        ]);

        $this->fileService->createFileRecord($fileModel, $file);

        return response()->json($fileModel->load('uploader:id,name'), 201);
    }

    /**
     * Get a signed upload URL for large project files.
     */
    public function getProjectUploadUrl(Request $request, string $companySlug, string $projectSlug): JsonResponse
    {
        Gate::authorize('admin');

        $project = $this->getProjectBySlug($companySlug, $projectSlug);

        $request->validate([
            'filename' => 'required|string|max:255',
            'content_type' => 'required|string|max:255',
            'file_size' => 'required|integer|min:1',
        ]);

        $originalFilename = $request->filename;
        $storedFilename = FileForProject::generateStoredFilename($originalFilename);
        $s3Path = FileForProject::generateS3Path($companySlug, $projectSlug, $storedFilename);

        $uploadUrl = $this->fileService->getSignedUploadUrl($s3Path, $request->content_type);

        // Create a pending file record
        $fileModel = FileForProject::create([
            'project_id' => $project->id,
            'original_filename' => $originalFilename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $request->content_type,
            'file_size_bytes' => $request->file_size,
            'uploaded_by_user_id' => Auth::id(),
        ]);

        return response()->json([
            'upload_url' => $uploadUrl,
            'file' => $fileModel->load('uploader:id,name'),
        ]);
    }

    /**
     * Download a project file.
     */
    public function downloadProjectFile(string $companySlug, string $projectSlug, int $fileId): JsonResponse
    {
        $project = $this->getProjectBySlug($companySlug, $projectSlug);

        $file = FileForProject::where('id', $fileId)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $file->recordDownload();

        $downloadUrl = $this->fileService->getSignedDownloadUrl(
            $file->s3_path,
            $file->stored_filename
        );

        return response()->json(['download_url' => $downloadUrl]);
    }

    /**
     * Get download history for a project file (admin only).
     */
    public function getProjectFileHistory(string $companySlug, string $projectSlug, int $fileId): JsonResponse
    {
        Gate::authorize('admin');

        $project = $this->getProjectBySlug($companySlug, $projectSlug);

        $file = FileForProject::where('id', $fileId)
            ->where('project_id', $project->id)
            ->with('uploader:id,name')
            ->firstOrFail();

        return response()->json([
            'file' => $file,
            'download_history' => $file->download_history ?? [],
        ]);
    }

    /**
     * Delete a project file (admin only).
     */
    public function deleteProjectFile(string $companySlug, string $projectSlug, int $fileId): JsonResponse
    {
        Gate::authorize('admin');

        $project = $this->getProjectBySlug($companySlug, $projectSlug);

        $file = FileForProject::where('id', $fileId)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $this->fileService->deleteFileRecord($file);

        return response()->json(['success' => true]);
    }

    /**
     * List files for a client company.
     */
    public function listClientCompanyFiles(string $companySlug): JsonResponse
    {
        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();

        $files = FileForClientCompany::where('client_company_id', $company->id)
            ->with('uploader:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($files);
    }

    /**
     * Upload a file to a client company.
     */
    public function uploadClientCompanyFile(Request $request, string $companySlug): JsonResponse
    {
        Gate::authorize('admin');

        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();

        $request->validate([
            'file' => 'required|file|max:102400',
        ]);

        $file = $request->file('file');
        $originalFilename = $file->getClientOriginalName();
        $storedFilename = FileForClientCompany::generateStoredFilename($originalFilename);
        $s3Path = FileForClientCompany::generateS3Path($companySlug, $storedFilename);

        $fileModel = new FileForClientCompany([
            'client_company_id' => $company->id,
            'original_filename' => $originalFilename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $file->getMimeType(),
            'file_size_bytes' => $file->getSize(),
            'uploaded_by_user_id' => Auth::id(),
        ]);

        $this->fileService->createFileRecord($fileModel, $file);

        return response()->json($fileModel->load('uploader:id,name'), 201);
    }

    /**
     * Get a signed upload URL for large client company files.
     */
    public function getClientCompanyUploadUrl(Request $request, string $companySlug): JsonResponse
    {
        Gate::authorize('admin');

        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();

        $request->validate([
            'filename' => 'required|string|max:255',
            'content_type' => 'required|string|max:255',
            'file_size' => 'required|integer|min:1',
        ]);

        $originalFilename = $request->filename;
        $storedFilename = FileForClientCompany::generateStoredFilename($originalFilename);
        $s3Path = FileForClientCompany::generateS3Path($companySlug, $storedFilename);

        $uploadUrl = $this->fileService->getSignedUploadUrl($s3Path, $request->content_type);

        $fileModel = FileForClientCompany::create([
            'client_company_id' => $company->id,
            'original_filename' => $originalFilename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $request->content_type,
            'file_size_bytes' => $request->file_size,
            'uploaded_by_user_id' => Auth::id(),
        ]);

        return response()->json([
            'upload_url' => $uploadUrl,
            'file' => $fileModel->load('uploader:id,name'),
        ]);
    }

    /**
     * Download a client company file.
     */
    public function downloadClientCompanyFile(string $companySlug, int $fileId): JsonResponse
    {
        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();

        $file = FileForClientCompany::where('id', $fileId)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $file->recordDownload();

        $downloadUrl = $this->fileService->getSignedDownloadUrl(
            $file->s3_path,
            $file->stored_filename
        );

        return response()->json(['download_url' => $downloadUrl]);
    }

    /**
     * Delete a client company file (admin only).
     */
    public function deleteClientCompanyFile(string $companySlug, int $fileId): JsonResponse
    {
        Gate::authorize('admin');

        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();

        $file = FileForClientCompany::where('id', $fileId)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $this->fileService->deleteFileRecord($file);

        return response()->json(['success' => true]);
    }

    /**
     * List files for an agreement.
     */
    public function listAgreementFiles(string $companySlug, int $agreementId): JsonResponse
    {
        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();
        $agreement = ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $files = FileForAgreement::where('agreement_id', $agreement->id)
            ->with('uploader:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($files);
    }

    /**
     * Upload a file to an agreement.
     */
    public function uploadAgreementFile(Request $request, string $companySlug, int $agreementId): JsonResponse
    {
        Gate::authorize('admin');

        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();
        $agreement = ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $request->validate([
            'file' => 'required|file|max:102400',
        ]);

        $file = $request->file('file');
        $originalFilename = $file->getClientOriginalName();
        $storedFilename = FileForAgreement::generateStoredFilename($originalFilename);
        $s3Path = FileForAgreement::generateS3Path($companySlug, $agreement->id, $storedFilename);

        $fileModel = new FileForAgreement([
            'agreement_id' => $agreement->id,
            'original_filename' => $originalFilename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $file->getMimeType(),
            'file_size_bytes' => $file->getSize(),
            'uploaded_by_user_id' => Auth::id(),
        ]);

        $this->fileService->createFileRecord($fileModel, $file);

        return response()->json($fileModel->load('uploader:id,name'), 201);
    }

    /**
     * Download an agreement file.
     */
    public function downloadAgreementFile(string $companySlug, int $agreementId, int $fileId): JsonResponse
    {
        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();
        $agreement = ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $file = FileForAgreement::where('id', $fileId)
            ->where('agreement_id', $agreement->id)
            ->firstOrFail();

        $file->recordDownload();

        $downloadUrl = $this->fileService->getSignedDownloadUrl(
            $file->s3_path,
            $file->stored_filename
        );

        return response()->json(['download_url' => $downloadUrl]);
    }

    /**
     * Delete an agreement file (admin only).
     */
    public function deleteAgreementFile(string $companySlug, int $agreementId, int $fileId): JsonResponse
    {
        Gate::authorize('admin');

        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();
        $agreement = ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $file = FileForAgreement::where('id', $fileId)
            ->where('agreement_id', $agreement->id)
            ->firstOrFail();

        $this->fileService->deleteFileRecord($file);

        return response()->json(['success' => true]);
    }

    /**
     * List files for a task.
     */
    public function listTaskFiles(string $companySlug, string $projectSlug, int $taskId): JsonResponse
    {
        $project = $this->getProjectBySlug($companySlug, $projectSlug);
        $task = ClientTask::where('id', $taskId)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $files = FileForTask::where('task_id', $task->id)
            ->with('uploader:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($files);
    }

    /**
     * Upload a file to a task.
     */
    public function uploadTaskFile(Request $request, string $companySlug, string $projectSlug, int $taskId): JsonResponse
    {
        Gate::authorize('admin');

        $project = $this->getProjectBySlug($companySlug, $projectSlug);
        $task = ClientTask::where('id', $taskId)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $request->validate([
            'file' => 'required|file|max:102400',
        ]);

        $file = $request->file('file');
        $originalFilename = $file->getClientOriginalName();
        $storedFilename = FileForTask::generateStoredFilename($originalFilename);
        $s3Path = FileForTask::generateS3Path($companySlug, $projectSlug, $task->id, $storedFilename);

        $fileModel = new FileForTask([
            'task_id' => $task->id,
            'original_filename' => $originalFilename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $file->getMimeType(),
            'file_size_bytes' => $file->getSize(),
            'uploaded_by_user_id' => Auth::id(),
        ]);

        $this->fileService->createFileRecord($fileModel, $file);

        return response()->json($fileModel->load('uploader:id,name'), 201);
    }

    /**
     * Download a task file.
     */
    public function downloadTaskFile(string $companySlug, string $projectSlug, int $taskId, int $fileId): JsonResponse
    {
        $project = $this->getProjectBySlug($companySlug, $projectSlug);
        $task = ClientTask::where('id', $taskId)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $file = FileForTask::where('id', $fileId)
            ->where('task_id', $task->id)
            ->firstOrFail();

        $file->recordDownload();

        $downloadUrl = $this->fileService->getSignedDownloadUrl(
            $file->s3_path,
            $file->stored_filename
        );

        return response()->json(['download_url' => $downloadUrl]);
    }

    /**
     * Delete a task file (admin only).
     */
    public function deleteTaskFile(string $companySlug, string $projectSlug, int $taskId, int $fileId): JsonResponse
    {
        Gate::authorize('admin');

        $project = $this->getProjectBySlug($companySlug, $projectSlug);
        $task = ClientTask::where('id', $taskId)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $file = FileForTask::where('id', $fileId)
            ->where('task_id', $task->id)
            ->firstOrFail();

        $this->fileService->deleteFileRecord($file);

        return response()->json(['success' => true]);
    }

    /**
     * List files for a financial account.
     */
    public function listFinAccountFiles(int $accountId): JsonResponse
    {
        $userId = Auth::id();
        $account = FinAccounts::where('acct_id', $accountId)
            ->where('acct_owner', $userId)
            ->firstOrFail();

        $files = FileForFinAccount::where('acct_id', $account->acct_id)
            ->with('uploader:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($files);
    }

    /**
     * Upload a file to a financial account.
     */
    public function uploadFinAccountFile(Request $request, int $accountId): JsonResponse
    {
        $userId = Auth::id();
        $account = FinAccounts::where('acct_id', $accountId)
            ->where('acct_owner', $userId)
            ->firstOrFail();

        $request->validate([
            'file' => 'required|file|max:102400',
            'statement_id' => 'nullable|integer',
        ]);

        $file = $request->file('file');
        $originalFilename = $file->getClientOriginalName();
        $storedFilename = FileForFinAccount::generateStoredFilename($originalFilename);
        $s3Path = FileForFinAccount::generateS3Path($account->acct_id, $storedFilename);

        $fileModel = new FileForFinAccount([
            'acct_id' => $account->acct_id,
            'statement_id' => $request->statement_id,
            'original_filename' => $originalFilename,
            'stored_filename' => $storedFilename,
            's3_path' => $s3Path,
            'mime_type' => $file->getMimeType(),
            'file_size_bytes' => $file->getSize(),
            'uploaded_by_user_id' => $userId,
        ]);

        $this->fileService->createFileRecord($fileModel, $file);

        return response()->json($fileModel->load('uploader:id,name'), 201);
    }

    /**
     * Download a financial account file.
     */
    public function downloadFinAccountFile(int $accountId, int $fileId): JsonResponse
    {
        $userId = Auth::id();
        $account = FinAccounts::where('acct_id', $accountId)
            ->where('acct_owner', $userId)
            ->firstOrFail();

        $file = FileForFinAccount::where('id', $fileId)
            ->where('acct_id', $account->acct_id)
            ->firstOrFail();

        $file->recordDownload();

        $downloadUrl = $this->fileService->getSignedDownloadUrl(
            $file->s3_path,
            $file->stored_filename
        );

        return response()->json(['download_url' => $downloadUrl]);
    }

    /**
     * Delete a financial account file.
     */
    public function deleteFinAccountFile(int $accountId, int $fileId): JsonResponse
    {
        $userId = Auth::id();
        $account = FinAccounts::where('acct_id', $accountId)
            ->where('acct_owner', $userId)
            ->firstOrFail();

        $file = FileForFinAccount::where('id', $fileId)
            ->where('acct_id', $account->acct_id)
            ->firstOrFail();

        $this->fileService->deleteFileRecord($file);

        return response()->json(['success' => true]);
    }

    /**
     * Get a project by company and project slug.
     */
    protected function getProjectBySlug(string $companySlug, string $projectSlug): ClientProject
    {
        $company = ClientCompany::where('slug', $companySlug)->firstOrFail();

        return ClientProject::where('slug', $projectSlug)
            ->where('client_company_id', $company->id)
            ->firstOrFail();
    }
}
