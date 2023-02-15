import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AxiosResponse } from '@nestjs/terminus/dist/health-indicator/http/axios.interfaces';
import { VCV2 } from '@prisma/client';
import { verify } from 'crypto';
import {
  JwtCredentialPayload,
  CredentialPayload,
  transformCredentialInput,
  Verifiable,
  W3CCredential,
} from 'did-jwt-vc';
import { DIDDocument } from 'did-resolver';
import { lastValueFrom, map } from 'rxjs';
import { PrismaService } from 'src/prisma.service';
import { DeriveCredentialDTO } from './dto/derive-credential.dto';
import { GetCredentialsBySubjectOrIssuer } from './dto/getCredentialsBySubjectOrIssuer.dto';
import { IssueCredentialDTO } from './dto/issue-credential.dto';
import { RenderTemplateDTO } from './dto/renderTemplate.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';
import { VerifyCredentialDTO } from './dto/verify-credential.dto';
import { RENDER_OUTPUT } from './enums/renderOutput.enum';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ION = require('@decentralized-identity/ion-tools');
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async getCredentials() {
    try {
      const credentials = await this.prisma.vCV2.findMany();
      return credentials;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }

  async getCredentialById(id: string) {
    try {
      const credential = await this.prisma.vC.findFirst({
        where: { id: id },
      });
      return credential;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }

  async verifyCredential(verifyRequest: VerifyCredentialDTO) {
    // resolve DID
    // const verificationMethod: VerificationMethod =
    //   credential.proof.verificationMethod;
    // const verificationMethod = 'did:ulp:5d7682f4-3cca-40fb-9fa2-1f6ebef4803b';
    console.log(
      'process.env.IDENTIY_BASE_URL: ',
      process.env.IDENTITY_BASE_URL,
    );
    const verificationMethod = verifyRequest.verifiableCredential.issuer;
    const verificationURL = `${process.env.IDENTITY_BASE_URL}/did/resolve/${verificationMethod}`;
    console.log('verificationURL: ', verificationURL);
    const dIDResponse: AxiosResponse = await this.httpService.axiosRef.get(
      verificationURL,
    );

    const did: DIDDocument = dIDResponse.data as DIDDocument;
    console.log('did in verify: ', verify);
    console.log(
      'verifyRequest.verifiableCredential:',
      verifyRequest.verifiableCredential,
    );
    // console.log(
    //   'verifyRequest.verifiableCredential?.proof?.proofValue: ',
    //   verifyRequest.verifiableCredential?.proof?.proofValue,
    // );
    try {
      const verified = await ION.verifyJws({
        jws: verifyRequest.verifiableCredential?.proof?.proofValue,
        publicJwk: did.verificationMethod[0].publicKeyJwk,
      });
      console.debug(verified);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async signVC(credentialPlayload: JwtCredentialPayload, did: string) {
    console.log('credentialPlayload: ', credentialPlayload);
    console.log('did: ', did);
    // did = 'did:ulp:5d7682f4-3cca-40fb-9fa2-1f6ebef4803b';
    const signedVCResponse: AxiosResponse =
      await this.httpService.axiosRef.post(
        `${process.env.IDENTITY_BASE_URL}/utils/sign`,
        {
          DID: did,
          payload: JSON.stringify(credentialPlayload),
        },
      );
    return signedVCResponse.data.signed as string;
  }

  async issueCredential(issueRequest: IssueCredentialDTO) {
    try {
      const credInReq = issueRequest.credential;
      /*
      //Code block for unsigned credential

      return await this.prisma.vCV2.create({ //use update incase the above codeblock is uncommented 
        data: {
          type: credInReq.type,
          issuer: credInReq.issuer as string,
          issuanceDate: credInReq.issuanceDate,
          expirationDate: credInReq.expirationDate,
          subject: JSON.stringify(credInReq.credentialSubject),
          //proof: credInReq.proof as any,
          credential_schema: JSON.stringify(issueRequest.credentialSchema), //because they can't refer to the schema db from here through an ID
          unsigned: credInReq as object,
        },

      */

      credInReq.proof = {
        proofValue: await this.signVC(
          transformCredentialInput(credInReq as CredentialPayload),
          credInReq.issuer as string,
        ),
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: credInReq.issuer,
        proofPurpose: 'assertionMethod',
      };
      //console.log('onto creation');

      //SEQUENTIAL ID LOGIC
      //first credential entry if database is empty
      if (
        (await this.prisma.counter.findFirst({
          where: { type_of_entity: 'Credential' },
        })) == null
      ) {
        await this.prisma.counter.create({
          data: {},
        });
      }
      const seqID = await this.prisma.counter.findFirst({
        where: { type_of_entity: 'Credential' },
      });

      const newCred = await this.prisma.vCV2.create({
        //use update incase the above codeblock is uncommented
        data: {
          seqid: seqID.for_next_credential,
          type: credInReq.type,
          issuer: credInReq.issuer as string,
          issuanceDate: credInReq.issuanceDate,
          expirationDate: credInReq.expirationDate,
          subject: JSON.stringify(credInReq.credentialSubject),
          proof: credInReq.proof as any,
          credential_schema: JSON.stringify(issueRequest.credentialSchema), //because they can't refer to the schema db from here through an ID
          signed: credInReq as object,
        },
      });
      //update counter only when credential has been created successfully
      await this.prisma.counter.update({
        where: { id: seqID.id },
        data: { for_next_credential: seqID.for_next_credential + 1 },
      });
      return newCred;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }

  async updateCredential(updateRequest: UpdateStatusDTO) {
    // TODO
    return;
  }

  async deleteCredential(id: string) {
    try {
      const credential = await this.prisma.vC.update({
        where: { id: id },
        data: {
          status: 'REVOKED',
        },
      });
      return credential;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }

  async getCredentialsBySubjectOrIssuer(
    getCreds: GetCredentialsBySubjectOrIssuer,
  ) {
    try {
      console.log('subject: ', getCreds.subject);
      console.log('issuer: ', getCreds.issuer);
      const credentials = await this.prisma.vCV2.findMany({
        where: {
          subject: JSON.stringify(getCreds.subject),
          issuer: getCreds.issuer,
        },
      });
      return credentials;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }

  async renderCredentials(renderingRequest: RenderTemplateDTO) {
    const output = renderingRequest.output;
    const credentail = renderingRequest.credentials;
    const schema = renderingRequest.schema;
    const template = renderingRequest.template;

    switch (output) {
      case RENDER_OUTPUT.QR:
        // const QRData = await this.renderAsQR(renderingRequest.credentials.credentialId);
        break;
      case RENDER_OUTPUT.STRING:
        break;
      case RENDER_OUTPUT.HTML:
        break;
      case RENDER_OUTPUT.QR_LINK:
        break;
      case RENDER_OUTPUT.STRING:
        break;
      case RENDER_OUTPUT.JSON:
        break;
    }
  }

  async deriveCredential(deriveRequest: DeriveCredentialDTO) {
    return;
  }

  // UTILITY FUNCTIONS
  async renderAsQR(credentialId: string): Promise<any> {
    const credential = await this.prisma.vC.findUnique({
      where: { id: credentialId },
    });

    try {
      const QRData = await QRCode.toDataURL(
        (credential.signed as Verifiable<W3CCredential>).proof.proofValue,
      );
      return QRData;
    } catch (err) {
      console.error(err);
      return err;
    }
  }
}
