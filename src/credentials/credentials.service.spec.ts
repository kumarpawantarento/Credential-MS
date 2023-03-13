import { HttpModule } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';
import { CredentialsService } from './credentials.service';
import Ajv2019 from 'ajv/dist/2019';

// setup ajv
const ajv = new Ajv2019();
ajv.addFormat('custom-date-time', function (dateTimeString) {
  return typeof dateTimeString === typeof new Date();
});

describe('CredentialsService', () => {
  let service: CredentialsService;
  const sampleCredReqPayload: any = {
    credential: {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://www.w3.org/2018/credentials/examples/v1',
      ],
      type: ['VerifiableCredential', 'UniversityDegreeCredential'],
      issuer: 'did:ulp:f36bd94e-218f-477b-a5ab-6642c06cef5b',
      issuanceDate: '2023-02-06T11:56:27.259Z',
      expirationDate: '2023-02-08T11:56:27.259Z',
      credentialSubject: {
        id: 'did:ulp:b4a191af-d86e-453c-9d0e-dd4771067235',
        grade: '9.23',
        programme: 'B.Tech',
        certifyingInstitute: 'IIIT Sonepat',
        evaluatingInstitute: 'NIT Kurukshetra',
      },
    },
    credentialSchemaId: 'did:ulpschema:c9cc0f03-4f94-4f44-9bcd-b24a86596fa2',
    tags: ['tag1', 'tag2', 'tag3'],
  };

  const issueCredentialReturnTypeSchema = {
    type: 'object',
    properties: {
      credential: {
        type: 'object',
        properties: {
          '@context': {
            type: 'array',
            items: [{ type: 'string' }],
          },
          id: {
            type: 'string',
          },
          type: {
            type: 'array',
            items: [{ type: 'string' }],
          },
          proof: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              created: { type: 'string' },
              proofValue: { type: 'string' },
              proofPurpose: { type: 'string' },
              verificationMethod: { type: 'string' },
            },
          },
          issuer: { type: 'string' },
          issuanceDate: { type: 'string' },
          expirationDate: { type: 'string' },
          credentialSubject: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              grade: { type: 'string' },
              programme: { type: 'string' },
              certifyingInstitute: { type: 'string' },
              evaluatingInstitute: { type: 'string' },
            },
            required: [
              'id',
              'grade',
              'programme',
              'certifyingInstitute',
              'evaluatingInstitute',
            ],
          },
        },
        required: [
          '@context',
          'id',
          'issuer',
          'expirationDate',
          'credentialSubject',
          'issuanceDate',
          'type',
          'proof',
        ],
      },
      credentialSchemaId: { type: 'string' },
      createdAt: { type: 'object', format: 'custom-date-time' },
      updatedAt: { type: 'object', format: 'custom-date-time' },
      createdBy: { type: 'string' },
      updatedBy: { type: 'string' },
      tags: {
        type: 'array',
        items: [{ type: 'string' }],
      },
    },
    required: [
      'credential',
      'credentialSchemaId',
      'tags',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
    ],
    additionalProperties: false,
  };

  const getCredentialByIdSchema = {
    type: 'object',
    properties: {
      '@context': {
        type: 'array',
        items: [{ type: 'string' }],
      },
      id: { type: 'string' },
      type: {
        type: 'array',
        items: [{ type: 'string' }],
      },
      issuer: { type: 'string' },
      issuanceDate: { type: 'string' },
      expirationDate: { type: 'string' },
      credentialSubject: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          grade: { type: 'string' },
          programme: { type: 'string' },
          certifyingInstitute: { type: 'string' },
          evaluatingInstitute: { type: 'string' },
        },
        required: [
          'id',
          'grade',
          'programme',
          'certifyingInstitute',
          'evaluatingInstitute',
        ],
      },
    },
    required: [
      '@context',
      'id',
      'issuer',
      'expirationDate',
      'credentialSubject',
      'issuanceDate',
      'type',
    ],
  };

  const validate = ajv.compile(issueCredentialReturnTypeSchema);
  const getCredReqValidate = ajv.compile(getCredentialByIdSchema);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [CredentialsService, PrismaService],
    }).compile();

    service = module.get<CredentialsService>(CredentialsService);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should issue a credential', async () => {
    const newCred = await service.issueCredential(sampleCredReqPayload);
    expect(validate(newCred)).toBe(true); // toHaveProperty('credential');
  });

  it('should get a credential', async () => {
    const newCred: any = await service.issueCredential(sampleCredReqPayload);
    const cred = await service.getCredentialById(newCred.credential?.id);
    expect(getCredReqValidate(cred)).toBe(true);
  });

  it('should verify a credential', async () => {
    const newCred: any = await service.issueCredential(sampleCredReqPayload);
    const verifyCred = await service.verifyCredential(newCred.credential?.id);
    console.log('verifyCred', verifyCred);
    expect(verifyCred).toEqual({
      status: 'ISSUED',
      checks: [
        {
          active: 'OK',
          revoked: 'OK',
          expired: 'NOK',
          proof: 'OK',
        },
      ],
    });
  });

  it('should get credentials by tag', async () => {
    const creds = await service.getCredentials(['tag1']);
    console.log('creds', creds);
    expect(creds).toBeInstanceOf(Array);

    if (creds.length > 0) {
      expect(getCredReqValidate(creds[0])).toBe(true);
    }
  });
});
