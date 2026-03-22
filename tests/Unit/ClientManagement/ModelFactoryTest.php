<?php

namespace Tests\Unit\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelFactoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_client_company_factory()
    {
        $company = ClientCompany::factory()->create();
        $this->assertNotNull($company->company_name);
        $this->assertNotNull($company->slug);
    }

    public function test_client_project_factory()
    {
        $project = ClientProject::factory()->create();
        $this->assertNotNull($project->name);
        $this->assertNotNull($project->slug);
        $this->assertInstanceOf(ClientCompany::class, $project->clientCompany);
        $this->assertInstanceOf(User::class, $project->creator);
    }

    public function test_client_agreement_factory()
    {
        $agreement = ClientAgreement::factory()->create();
        $this->assertInstanceOf(ClientCompany::class, $agreement->clientCompany);
        $this->assertNull($agreement->client_company_signed_date);
    }

    public function test_client_agreement_signed_state()
    {
        $agreement = ClientAgreement::factory()->signed()->create();
        $this->assertNotNull($agreement->client_company_signed_date);
        $this->assertInstanceOf(User::class, $agreement->signedByUser);
    }

    public function test_client_time_entry_factory()
    {
        $entry = ClientTimeEntry::factory()->create();
        $this->assertInstanceOf(ClientProject::class, $entry->project);
        $this->assertInstanceOf(ClientCompany::class, $entry->clientCompany);
        $this->assertEquals($entry->project->client_company_id, $entry->client_company_id);
        $this->assertInstanceOf(User::class, $entry->user);
    }
}
